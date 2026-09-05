// middleware/limites.js
// Freio contra automação abusando das rotas públicas: tentativas de adivinhar
// senha no login, e envios em massa no formulário.
//
// Guardado em memória (um Map), não no banco: os contadores são descartáveis
// por natureza — se o processo reiniciar, voltam a zero, e não tem problema
// nenhum nisso. Para o tamanho deste sistema (uma instância só, gratuita),
// não vale a complexidade de um limitador distribuído.

function origemDe(req) {
  // req.ip (não o cabeçalho x-forwarded-for lido na mão): com
  // app.set('trust proxy', 1) em server.js, o Express já anda um salto de
  // confiança a partir do lado do servidor da cadeia. Pegar o primeiro
  // valor do cabeçalho manualmente é forjável — quem faz a requisição pode
  // prependar qualquer IP falso antes do proxy anexar o real, e o código
  // antigo confiava nesse valor de origem do próprio cliente.
  return req.ip || 'desconhecido';
}

/**
 * Cria um middleware de limite de tentativas por janela de tempo.
 *
 * @param {number} limite      quantas tentativas permite dentro da janela
 * @param {number} janelaMs    duração da janela, em milissegundos
 * @param {(req) => string} chave  identifica quem está tentando
 */
function criarLimitador({ limite, janelaMs, chave }) {
  const tentativas = new Map();
  let ultimaLimpeza = Date.now();

  // Uma chave só é reavaliada quando alguém volta a usá-la. Sem esta varredura,
  // quem nunca mais aparece fica no Map para sempre — e como a chave do login
  // inclui o e-mail digitado, bastaria variar o e-mail a cada tentativa para
  // fazer o Map crescer sem teto e consumir a memória do processo.
  function limparExpirados(agora) {
    for (const [id, marcas] of tentativas) {
      if (marcas.every((t) => agora - t >= janelaMs)) tentativas.delete(id);
    }
    ultimaLimpeza = agora;
  }

  return function limitar(req, res, next) {
    const id = chave(req);
    const agora = Date.now();

    if (agora - ultimaLimpeza > janelaMs) limparExpirados(agora);

    const lista = (tentativas.get(id) || []).filter((t) => agora - t < janelaMs);

    if (lista.length >= limite) {
      const tentarEmSegundos = Math.ceil((janelaMs - (agora - lista[0])) / 1000);
      return res.status(429).json({
        erro: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.',
        tentarEmSegundos,
      });
    }

    lista.push(agora);
    tentativas.set(id, lista);
    next();
  };
}

// LOGIN — a chave combina IP e e-mail. Só por IP travaria o acesso de toda
// uma equipe que sai pelo mesmo endereço de rede (roteador da empresa) quando
// só uma pessoa está errando a senha; só por e-mail deixaria alguém de fora
// tentar adivinhar a senha de uma conta usando vários IPs diferentes.
const limiteLogin = criarLimitador({
  limite: 8,
  janelaMs: 15 * 60 * 1000, // 15 minutos
  chave: (req) => `${origemDe(req)}|${String(req.body?.email || '').toLowerCase().trim()}`,
});

// LOGIN, teto por IP — segunda trava, mais folgada, sobre a de cima.
//
// POR QUE PRECISA DAS DUAS: como a chave do limitador acima inclui o e-mail,
// cada e-mail diferente estreia com o contador zerado. Quem varia o e-mail a
// cada tentativa nunca esbarra naquele limite — dá para disparar centenas de
// tentativas do mesmo lugar, sondando quais contas existem e enchendo o
// histórico de acessos de lixo. Este teto fecha essa porta sem desfazer o
// motivo do outro: 40 tentativas em 15 minutos é muito acima do que uma
// equipe inteira compartilhando o mesmo roteador faria de verdade, e muito
// abaixo do que uma varredura automatizada precisa.
const limiteLoginPorIP = criarLimitador({
  limite: 40,
  janelaMs: 15 * 60 * 1000,
  chave: (req) => origemDe(req),
});

// FORMULÁRIO — só por IP: é rota pública e anônima, não existe e-mail para
// diferenciar quem envia. O limite é bem mais folgado que o do login porque
// aqui é normal várias pessoas do mesmo posto de trabalho responderem em
// sequência ao longo do turno.
const limiteFormulario = criarLimitador({
  limite: 30,
  janelaMs: 60 * 60 * 1000, // 1 hora
  chave: (req) => origemDe(req),
});

// ---------------------------------------------------------------------------
// Rotas de escrita autenticadas — por USUÁRIO, não por IP.
//
// POR QUE POR USUÁRIO: login e formulário são as únicas rotas que um
// desconhecido consegue chamar sem token, então travar por IP faz sentido
// para as duas. Daqui para baixo quem chama já está identificado por um
// login — o risco não é mais "alguém de fora adivinhando", é "um token
// vazado ou uma conta comprometida automatizando chamadas". Travar por
// usuário barra esse abuso sem arriscar derrubar uma equipe inteira que sai
// pelo mesmo IP.
// ---------------------------------------------------------------------------

// AÇÃO PÓS-ALERTA — a rota exige só login (não admin), então qualquer conta
// de gestão vazada conseguiria despejar linhas em acoes_alerta sem limite
// algum antes desta trava existir.
const limiteAcaoAlerta = criarLimitador({
  limite: 20,
  janelaMs: 15 * 60 * 1000,
  chave: (req) => req.usuario._id.toString(),
});

// TROCAR A PRÓPRIA SENHA — trocar de senha é raro; um volume alto na mesma
// conta é sinal de automação testando um token roubado, não uso normal.
const limiteTrocarSenha = criarLimitador({
  limite: 10,
  janelaMs: 15 * 60 * 1000,
  chave: (req) => req.usuario._id.toString(),
});

// CRUD DE CONTAS — só administradores chegam aqui (rota já exige
// exigirAdmin). O volume normal de criar/editar/remover contas é baixo; um
// token de admin comprometido não deveria conseguir esvaziar ou inflar a
// base de contas de uma vez.
const limiteEscritaUsuarios = criarLimitador({
  limite: 30,
  janelaMs: 15 * 60 * 1000,
  chave: (req) => req.usuario._id.toString(),
});

module.exports = {
  limiteLogin,
  limiteLoginPorIP,
  limiteFormulario,
  limiteAcaoAlerta,
  limiteTrocarSenha,
  limiteEscritaUsuarios,
};
