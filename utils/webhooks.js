// utils/webhooks.js
// Avisa sistemas de fora (RH, help desk, planilha da gestão) quando algo
// acontece aqui dentro.
//
// POR QUE ISSO EXISTE: até aqui, quem precisava agir só descobria o problema
// se abrisse o painel. Um setor podia passar dias em risco alto sem que o RH
// soubesse, porque ninguém entrou no dashboard naquela semana. O webhook
// inverte isso: o sistema procura quem precisa agir, em vez de esperar.
//
// REGRA QUE VALE PARA TUDO NESTE ARQUIVO: nenhuma falha de webhook pode
// derrubar a operação que o disparou. Se o RH estiver fora do ar, o
// trabalhador ainda precisa conseguir enviar a resposta dele.

const crypto = require('crypto');
const config = require('../config');

/**
 * Assina o corpo do envio com HMAC-SHA256.
 *
 * POR QUE ASSINAR: a URL do webhook é só um endereço HTTP. Sem assinatura,
 * qualquer um que descubra o endereço consegue inventar um alerta de "risco
 * alto na Produção" e fazer o RH agir sobre um setor que está bem. Com a
 * assinatura, quem recebe confere que o envio veio mesmo daqui.
 */
function assinar(corpo) {
  if (!config.WEBHOOKS.SEGREDO) return null;
  return crypto
    .createHmac('sha256', config.WEBHOOKS.SEGREDO)
    .update(corpo)
    .digest('hex');
}

/** Devolve a URL configurada para um evento, ou null se ele está desligado. */
function destinoDe(evento) {
  return config.WEBHOOKS.DESTINOS[evento] || null;
}

/**
 * Faz uma tentativa de entrega. Resolve com true em resposta 2xx.
 *
 * Erro 4xx não é retentado: o destino entendeu o envio e recusou. Repetir o
 * mesmo corpo daria o mesmo 400 três vezes seguidas, só mais devagar.
 */
async function tentarEntregar(url, corpo, assinatura) {
  const cabecalhos = {
    'Content-Type': 'application/json',
    'User-Agent': 'RiscoZero-Webhook',
  };
  if (assinatura) cabecalhos['X-RiscoZero-Assinatura'] = `sha256=${assinatura}`;

  const resposta = await fetch(url, {
    method: 'POST',
    headers: cabecalhos,
    body: corpo,
    signal: AbortSignal.timeout(config.WEBHOOKS.TIMEOUT_MS),
  });

  if (resposta.ok) return { entregue: true };
  return {
    entregue: false,
    definitivo: resposta.status >= 400 && resposta.status < 500,
    motivo: `HTTP ${resposta.status}`,
  };
}

/**
 * Dispara um evento para o destino configurado.
 *
 * Devolve uma Promise que NUNCA rejeita — quem chama pode usar `await` para
 * testar ou ignorar o retorno em produção, sem precisar de try/catch em volta.
 *
 * @param evento 'resposta_criada' | 'alerta_criado' | 'acao_registrada'
 * @param dados objeto livre, vai como campo "dados" do corpo
 */
async function disparar(evento, dados) {
  const url = destinoDe(evento);
  if (!url) return { disparado: false, motivo: 'evento sem URL configurada' };

  const corpo = JSON.stringify({
    evento,
    // ISO com fuso em UTC: quem recebe converte para o fuso dele sem ambiguidade.
    momento: new Date().toISOString(),
    dados,
  });
  const assinatura = assinar(corpo);

  let ultimoMotivo = '';
  for (let tentativa = 1; tentativa <= config.WEBHOOKS.TENTATIVAS; tentativa++) {
    try {
      const r = await tentarEntregar(url, corpo, assinatura);
      if (r.entregue) return { disparado: true, tentativas: tentativa };
      ultimoMotivo = r.motivo;
      if (r.definitivo) break;
    } catch (erro) {
      // Timeout, DNS, conexão recusada: vale tentar de novo.
      ultimoMotivo = erro.name === 'TimeoutError' ? 'tempo esgotado' : erro.message;
    }

    // Espera crescente entre tentativas: se o destino caiu, bater de novo no
    // mesmo instante só aumenta a fila dele.
    if (tentativa < config.WEBHOOKS.TENTATIVAS) {
      await new Promise((r) => setTimeout(r, 500 * tentativa));
    }
  }

  console.error(`Webhook "${evento}" não entregue: ${ultimoMotivo}`);
  return { disparado: false, motivo: ultimoMotivo };
}

/**
 * Versão para usar no meio de uma rota: dispara sem segurar a resposta HTTP.
 *
 * POR QUE NÃO ESPERAR: com 3 tentativas e 5 segundos de tempo limite cada, um
 * destino fora do ar faria o trabalhador esperar até 16 segundos na tela do
 * formulário para ver "resposta gravada" — de uma gravação que já tinha dado
 * certo no primeiro segundo.
 */
function dispararEmSegundoPlano(evento, dados) {
  disparar(evento, dados).catch((erro) => {
    console.error(`Webhook "${evento}" falhou de forma inesperada:`, erro.message);
  });
}

module.exports = { disparar, dispararEmSegundoPlano, destinoDe, assinar };
