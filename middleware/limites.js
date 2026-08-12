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

  return function limitar(req, res, next) {
    const id = chave(req);
    const agora = Date.now();

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

// FORMULÁRIO — só por IP: é rota pública e anônima, não existe e-mail para
// diferenciar quem envia. O limite é bem mais folgado que o do login porque
// aqui é normal várias pessoas do mesmo posto de trabalho responderem em
// sequência ao longo do turno.
const limiteFormulario = criarLimitador({
  limite: 30,
  janelaMs: 60 * 60 * 1000, // 1 hora
  chave: (req) => origemDe(req),
});

module.exports = { limiteLogin, limiteFormulario };
