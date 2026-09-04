// testes/testar-webhooks.js
// Testa os avisos automáticos para sistemas de fora (utils/webhooks.js).
//
//   node testes/testar-webhooks.js
//
// Sobe um servidor HTTP local que faz o papel do sistema do RH e confere o
// que chega nele: formato do corpo, assinatura, novas tentativas em caso de
// falha e — o mais importante — que um destino quebrado não derruba nada aqui.

const http = require('http');
const crypto = require('crypto');

let passou = 0;
let falhou = 0;
const falhas = [];

function ok(nome, condicao, detalhe = '') {
  if (condicao) {
    passou++;
    console.log(`  OK    ${nome}`);
  } else {
    falhou++;
    falhas.push(nome);
    console.log(`  FALHA ${nome}${detalhe ? ' -> ' + detalhe : ''}`);
  }
}

function secao(t) { console.log(`\n=== ${t} ===`); }

const SEGREDO = 'segredo-de-teste';

/**
 * Sobe um servidor que responde o que o teste mandar e guarda o que recebeu.
 * `respostas` é a fila de códigos HTTP devolvidos, um por requisição.
 */
function servidorFalso(respostas = [200]) {
  const recebidos = [];
  let i = 0;

  const servidor = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (p) => { corpo += p; });
    req.on('end', () => {
      recebidos.push({ corpo, cabecalhos: req.headers, metodo: req.method });
      const codigo = respostas[Math.min(i, respostas.length - 1)];
      i++;
      res.writeHead(codigo);
      res.end('');
    });
  });

  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${servidor.address().port}/rh`,
        recebidos,
        fechar: () => new Promise((r) => servidor.close(r)),
      });
    });
  });
}

/** Recarrega config e webhooks com as variáveis de ambiente do momento. */
function carregarWebhooks() {
  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../utils/webhooks')];
  return require('../utils/webhooks');
}

async function rodar() {
  // -------------------------------------------------------------------------
  secao('SEM CONFIGURACAO');

  delete process.env.WEBHOOK_RH_RESPOSTA;
  delete process.env.WEBHOOK_SEGREDO;
  let webhooks = carregarWebhooks();

  ok('evento sem URL não é disparado',
    (await webhooks.disparar('resposta_criada', { setor: 'producao' })).disparado === false);

  ok('destinoDe devolve null sem configuração',
    webhooks.destinoDe('resposta_criada') === null);

  // -------------------------------------------------------------------------
  secao('ENTREGA E FORMATO');

  let destino = await servidorFalso([200]);
  process.env.WEBHOOK_RH_RESPOSTA = destino.url;
  process.env.WEBHOOK_SEGREDO = SEGREDO;
  webhooks = carregarWebhooks();

  let r = await webhooks.disparar('resposta_criada', { setor: 'producao', turno: 'Noite' });
  ok('entrega em destino saudável', r.disparado === true, JSON.stringify(r));
  ok('chegou exatamente um envio', destino.recebidos.length === 1);

  const enviado = JSON.parse(destino.recebidos[0].corpo);
  ok('corpo traz o nome do evento', enviado.evento === 'resposta_criada');
  ok('corpo traz o momento em ISO', typeof enviado.momento === 'string' && enviado.momento.endsWith('Z'));
  ok('corpo traz os dados intactos', enviado.dados.setor === 'producao' && enviado.dados.turno === 'Noite');
  ok('envio é POST', destino.recebidos[0].metodo === 'POST');

  // -------------------------------------------------------------------------
  secao('ASSINATURA');

  const esperada = crypto.createHmac('sha256', SEGREDO)
    .update(destino.recebidos[0].corpo).digest('hex');
  ok('assinatura confere com o corpo recebido',
    destino.recebidos[0].cabecalhos['x-riscozero-assinatura'] === `sha256=${esperada}`);

  ok('corpo alterado não bate com a assinatura',
    crypto.createHmac('sha256', SEGREDO).update('outro corpo').digest('hex') !== esperada);

  await destino.fechar();

  // Sem segredo configurado, o envio sai sem cabeçalho de assinatura
  destino = await servidorFalso([200]);
  process.env.WEBHOOK_RH_RESPOSTA = destino.url;
  delete process.env.WEBHOOK_SEGREDO;
  webhooks = carregarWebhooks();
  await webhooks.disparar('resposta_criada', {});
  ok('sem segredo, não manda cabeçalho de assinatura',
    destino.recebidos[0].cabecalhos['x-riscozero-assinatura'] === undefined);
  await destino.fechar();

  // -------------------------------------------------------------------------
  secao('FALHAS E NOVAS TENTATIVAS');

  // 500 é falha do lado de lá: vale insistir
  destino = await servidorFalso([500, 500, 200]);
  process.env.WEBHOOK_RH_RESPOSTA = destino.url;
  process.env.WEBHOOK_TENTATIVAS = '3';
  webhooks = carregarWebhooks();
  r = await webhooks.disparar('resposta_criada', {});
  ok('insiste depois de erro 500 e entrega na terceira',
    r.disparado === true && destino.recebidos.length === 3,
    `${r.disparado} com ${destino.recebidos.length} envios`);
  await destino.fechar();

  // 400 é recusa: repetir o mesmo corpo daria o mesmo 400
  destino = await servidorFalso([400]);
  process.env.WEBHOOK_RH_RESPOSTA = destino.url;
  webhooks = carregarWebhooks();
  r = await webhooks.disparar('resposta_criada', {});
  ok('não insiste depois de erro 400',
    r.disparado === false && destino.recebidos.length === 1,
    `${destino.recebidos.length} envios`);
  await destino.fechar();

  // -------------------------------------------------------------------------
  secao('DESTINO FORA DO AR NÃO DERRUBA NADA');

  // Porta fechada: nenhuma conexão possível
  process.env.WEBHOOK_RH_RESPOSTA = 'http://127.0.0.1:1/rh';
  process.env.WEBHOOK_TENTATIVAS = '2';
  webhooks = carregarWebhooks();

  r = await webhooks.disparar('resposta_criada', {});
  ok('destino inalcançável devolve falha em vez de lançar erro',
    r.disparado === false && typeof r.motivo === 'string', JSON.stringify(r));

  // Esta é a garantia que importa: é o que roda dentro da rota do formulário
  let quebrou = false;
  try {
    webhooks.dispararEmSegundoPlano('resposta_criada', {});
  } catch (e) {
    quebrou = true;
  }
  ok('disparo em segundo plano não lança erro na rota', quebrou === false);

  // Dá tempo das tentativas em segundo plano falharem sem processo pendurado
  await new Promise((res) => setTimeout(res, 1200));

  // -------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`  ${passou} passaram, ${falhou} falharam`);
  if (falhas.length > 0) console.log(`  Falharam: ${falhas.join(', ')}`);
  console.log('====================================================');
  process.exit(falhou > 0 ? 1 : 0);
}

rodar();
