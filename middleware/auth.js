// middleware/auth.js
// Autenticação por JWT.
//
//   exigirLogin    → qualquer conta ativa pode passar, e define req.usuario
//   exigirAdmin    → só quem tem papel "admin" passa (usar DEPOIS de exigirLogin,
//                    já que depende de req.usuario)
//   exigirAcessoBI → aceita também uma chave de leitura de ferramenta de
//                    análise (ver models/TokenBI.js)
//
// POR QUE JWT E NÃO SESSÃO GUARDADA NO SERVIDOR: o token carrega a prova de
// quem é o usuário dentro dele mesmo (assinado — não dá para forjar sem a
// chave), então o servidor não precisa guardar nada em memória para saber
// quem está logado. Isso importa aqui porque a hospedagem gratuita reinicia o
// processo sozinha depois de um tempo sem uso — uma sessão em memória se
// perderia junto, e todo mundo cairia sem aviso.

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Usuario } = require('../models/Usuario');
const { TokenBI } = require('../models/TokenBI');

const SEGREDO = process.env.JWT_SECRET;

if (!SEGREDO) {
  // Falha ao SUBIR o servidor, não no meio de uma requisição: é melhor travar
  // aqui com uma mensagem clara do que emitir tokens assinados com uma chave
  // vazia, ou que mudam a cada reinício e derrubam todo mundo sem explicação.
  throw new Error(
    'JWT_SECRET não definido. Copie .env.example para .env e preencha a chave antes de iniciar o servidor.'
  );
}

if (SEGREDO.length < 32) {
  // Um segredo curto (ex.: "123" ou "senha") passaria na checagem acima —
  // ela só confere que a variável existe, não que é forte o suficiente para
  // assinar um token que não pode ser forjado. 32 caracteres é o mínimo
  // recomendado para HMAC-SHA256, que é o algoritmo padrão do jsonwebtoken.
  throw new Error(
    'JWT_SECRET é curto demais (mínimo 32 caracteres). Gere um novo com: ' +
    'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

// 8h cobre um turno de trabalho inteiro sem pedir login de novo no meio do
// expediente, mas expira sozinha se alguém esquecer a sessão aberta.
const VALIDADE = '8h';

function gerarToken(usuario) {
  return jwt.sign({ id: usuario._id.toString() }, SEGREDO, { expiresIn: VALIDADE });
}

async function exigirLogin(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'É preciso estar logado.' });
  }

  try {
    const payload = jwt.verify(token, SEGREDO);
    const usuario = await Usuario.findById(payload.id);

    // Cobre dois casos com a mesma resposta: o ID do token não existe mais
    // (conta removida) e a conta foi desativada depois que o token foi
    // emitido. Nos dois, o acesso não deve continuar valendo, mesmo com um
    // token que ainda não expirou.
    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ erro: 'Sessão inválida.' });
    }

    req.usuario = usuario;
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

// Prefixo fixo no começo de toda chave de BI.
//
// POR QUE EXISTE: uma chave solta num arquivo de configuração ou colada num
// chat é só um monte de letras. Com o prefixo, quem encontra sabe na hora o
// que é e de onde veio — e varreduras de segredo vazado em repositórios
// conseguem reconhecê-la por padrão.
const PREFIXO_TOKEN_BI = 'rzbi_';

/** Gera uma chave nova e devolve o valor cru junto do que vai para o banco. */
function gerarTokenBI() {
  const bruto = PREFIXO_TOKEN_BI + crypto.randomBytes(32).toString('hex');
  return {
    bruto,
    hash: hashTokenBI(bruto),
    // Só o suficiente para distinguir uma chave da outra numa lista.
    prefixo: bruto.slice(0, PREFIXO_TOKEN_BI.length + 6),
  };
}

function hashTokenBI(bruto) {
  return crypto.createHash('sha256').update(bruto).digest('hex');
}

/**
 * Libera as rotas de exportação para ferramentas de análise.
 *
 * Aceita os dois tipos de credencial de propósito: a chave de BI, usada pelo
 * Power BI em atualização agendada, e o token de login normal — sem este
 * segundo caminho, ninguém da equipe conseguiria conferir no navegador o que
 * a exportação devolve sem antes criar uma chave.
 */
async function exigirAcessoBI(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'É preciso enviar uma chave de acesso.' });
  }

  if (!token.startsWith(PREFIXO_TOKEN_BI)) {
    return exigirLogin(req, res, next);
  }

  try {
    const registro = await TokenBI.findOne({ hash: hashTokenBI(token) });

    // Chave desconhecida, revogada e vencida dão a mesma resposta: dizer qual
    // dos três é ajudaria quem está testando chaves a saber que acertou uma
    // que só está vencida.
    if (!registro || registro.revogadaEm || registro.expiraEm <= new Date()) {
      return res.status(401).json({ erro: 'Chave de acesso inválida ou expirada.' });
    }

    // Gravar o uso é o que permite achar chaves esquecidas depois. Falhar
    // aqui não pode negar o acesso: a leitura em si já foi autorizada.
    TokenBI.updateOne({ _id: registro._id }, { ultimoUso: new Date() }).catch(() => {});

    req.tokenBI = registro;
    next();
  } catch (erro) {
    console.error('Erro ao validar chave de BI:', erro.message);
    res.status(500).json({ erro: 'Erro ao validar a chave de acesso.' });
  }
}

function exigirAdmin(req, res, next) {
  if (!req.usuario || req.usuario.papel !== 'admin') {
    return res.status(403).json({ erro: 'Apenas administradores podem fazer isso.' });
  }
  next();
}

module.exports = {
  gerarToken,
  exigirLogin,
  exigirAdmin,
  exigirAcessoBI,
  gerarTokenBI,
  hashTokenBI,
};
