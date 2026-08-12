// middleware/auth.js
// Autenticação por JWT.
//
//   exigirLogin  → qualquer conta ativa pode passar, e define req.usuario
//   exigirAdmin  → só quem tem papel "admin" passa (usar DEPOIS de exigirLogin,
//                  já que depende de req.usuario)
//
// POR QUE JWT E NÃO SESSÃO GUARDADA NO SERVIDOR: o token carrega a prova de
// quem é o usuário dentro dele mesmo (assinado — não dá para forjar sem a
// chave), então o servidor não precisa guardar nada em memória para saber
// quem está logado. Isso importa aqui porque a hospedagem gratuita reinicia o
// processo sozinha depois de um tempo sem uso — uma sessão em memória se
// perderia junto, e todo mundo cairia sem aviso.

const jwt = require('jsonwebtoken');
const { Usuario } = require('../models/Usuario');

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

function exigirAdmin(req, res, next) {
  if (!req.usuario || req.usuario.papel !== 'admin') {
    return res.status(403).json({ erro: 'Apenas administradores podem fazer isso.' });
  }
  next();
}

module.exports = { gerarToken, exigirLogin, exigirAdmin };
