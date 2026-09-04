// testes/testar-bi.js
// Testa as rotas de exportação para ferramentas de análise (routes/bi.js),
// subindo o Express de verdade com o banco em memória.
//
//   node testes/testar-bi.js
//
// O que mais importa aqui: quem pode ler os dados, e o que NÃO sai na
// exportação — o comentário em texto livre nunca pode vazar por esta porta.

process.env.JWT_SECRET = 'chave-de-teste-nao-usar-em-producao-1234567890';

const express = require('express');
const { instalar } = require('./mongo-falso');
const { Resposta } = require('../models/Resposta');
const { Usuario } = require('../models/Usuario');
const { TokenBI } = require('../models/TokenBI');
const { LogAcesso } = require('../models/LogAcesso');

instalar(Resposta, { datas: ['data_envio'] });
instalar(Usuario, { unicos: ['email'], datas: ['ultimoAcesso', 'createdAt', 'updatedAt'] });
instalar(TokenBI, { unicos: ['hash'], datas: ['criadoEm', 'expiraEm', 'ultimoUso', 'revogadaEm'] });
instalar(LogAcesso, { datas: ['data'] });

const authRouter = require('../routes/auth');
const biRouter = require('../routes/bi');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/bi', biRouter);

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

let base;

async function pedir(metodo, caminho, { token, corpo } = {}) {
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: resposta.status, dados: await resposta.json() };
}

async function rodar() {
  secao('PREPARAÇÃO');

  const admin = new Usuario({ nome: 'Pedro', email: 'pedro@ceeppg.br', papel: 'admin' });
  await admin.definirSenha('senha123');
  await admin.save();

  const gestor = new Usuario({ nome: 'Ana', email: 'ana@ceeppg.br', papel: 'gestor' });
  await gestor.definirSenha('senha456');
  await gestor.save();

  const agora = new Date();
  const ontem = new Date(agora); ontem.setDate(ontem.getDate() - 1);

  await Resposta.insertMany([
    { setor: 'Producao', turno: 'Noite', estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 1, data_envio: agora, comentario: 'segredo que nao pode vazar' },
    { setor: 'Producao', turno: 'Tarde', estresse: 4, sono: 2, carga_trabalho: 4, ambiente_fisico: 2, data_envio: ontem },
    { setor: 'TI', turno: 'Manha', estresse: 1, sono: 5, carga_trabalho: 2, ambiente_fisico: 5, data_envio: ontem },
  ]);
  ok('3 respostas inseridas', (await Resposta.countDocuments()) === 3);

  const login = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'pedro@ceeppg.br', senha: 'senha123' },
  });
  const tokenAdmin = login.dados.token;
  ok('login de admin devolve token', typeof tokenAdmin === 'string');

  const loginGestor = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'ana@ceeppg.br', senha: 'senha456' },
  });
  const tokenGestor = loginGestor.dados.token;

  // -------------------------------------------------------------------------
  secao('QUEM PODE CRIAR CHAVE');

  let r = await pedir('POST', '/api/bi/chaves', { corpo: { nome: 'Power BI do RH' } });
  ok('sem login não cria chave', r.status === 401);

  r = await pedir('POST', '/api/bi/chaves', {
    token: tokenGestor, corpo: { nome: 'Power BI do RH' },
  });
  ok('gestor comum não cria chave', r.status === 403, String(r.status));

  r = await pedir('POST', '/api/bi/chaves', { token: tokenAdmin, corpo: { nome: '' } });
  ok('chave sem nome é recusada', r.status === 400);

  r = await pedir('POST', '/api/bi/chaves', {
    token: tokenAdmin, corpo: { nome: 'Longa demais', dias: 9999 },
  });
  ok('validade acima do teto é recusada', r.status === 400);

  r = await pedir('POST', '/api/bi/chaves', {
    token: tokenAdmin, corpo: { nome: 'Power BI do RH' },
  });
  const chave = r.dados.chave;
  const idChave = r.dados.id;
  ok('admin cria chave', r.status === 201 && typeof chave === 'string');
  ok('chave sai com prefixo reconhecível', chave.startsWith('rzbi_'));

  // -------------------------------------------------------------------------
  secao('A CHAVE NÃO FICA GUARDADA');

  const guardada = await TokenBI.findById(idChave);
  ok('banco não guarda o valor da chave',
    JSON.stringify(guardada).includes(chave) === false);
  ok('banco guarda só o hash', typeof guardada.hash === 'string' && guardada.hash.length === 64);

  r = await pedir('GET', '/api/bi/chaves', { token: tokenAdmin });
  ok('listagem não devolve o valor da chave',
    JSON.stringify(r.dados).includes(chave) === false);
  ok('listagem mostra a chave como ativa',
    r.dados.length === 1 && r.dados[0].situacao === 'ativa');

  // -------------------------------------------------------------------------
  secao('ACESSO ÀS EXPORTAÇÕES');

  for (const rota of ['/api/bi/completo', '/api/bi/agregado', '/api/bi/serie']) {
    r = await pedir('GET', rota);
    ok(`${rota} exige credencial`, r.status === 401);

    r = await pedir('GET', rota, { token: 'rzbi_chaveinventadaquenaoexiste' });
    ok(`${rota} recusa chave inventada`, r.status === 401);

    r = await pedir('GET', rota, { token: chave });
    ok(`${rota} aceita a chave de BI`, r.status === 200, String(r.status));

    r = await pedir('GET', rota, { token: tokenGestor });
    ok(`${rota} aceita login de gestão`, r.status === 200, String(r.status));
  }

  // -------------------------------------------------------------------------
  secao('COMENTÁRIO NUNCA SAI NA EXPORTAÇÃO');

  // Esta é a garantia central: o comentário é o campo capaz de identificar
  // quem respondeu, e quem recebe o arquivo decidiria sozinho o que mostrar.
  for (const rota of ['/api/bi/completo', '/api/bi/agregado', '/api/bi/serie']) {
    r = await pedir('GET', rota, { token: chave });
    ok(`${rota} não vaza o comentário`,
      JSON.stringify(r.dados).includes('segredo que nao pode vazar') === false);
  }

  // -------------------------------------------------------------------------
  secao('CONTEÚDO DAS EXPORTAÇÕES');

  r = await pedir('GET', '/api/bi/completo', { token: chave });
  ok('completo devolve uma linha por resposta', r.dados.total === 3 && r.dados.dados.length === 3);
  ok('completo traz índice já calculado',
    typeof r.dados.dados[0].indiceRisco === 'number' && typeof r.dados.dados[0].nivel === 'string');
  ok('completo diz se há mais páginas', r.dados.temMais === false);

  r = await pedir('GET', '/api/bi/completo', { token: chave, });
  const primeiraPagina = await pedir('GET', '/api/bi/completo?limite=2&pagina=1', { token: chave });
  ok('completo pagina os resultados',
    primeiraPagina.dados.dados.length === 2 && primeiraPagina.dados.temMais === true);

  r = await pedir('GET', '/api/bi/agregado', { token: chave });
  ok('agregado separa por setor', r.dados.porSetor.length === 2);
  ok('agregado separa por turno', r.dados.porTurno.length === 3);
  const producao = r.dados.porSetor.find((s) => s.setor === 'Producao');
  ok('agregado traz o total de respostas do setor', producao.total === 2);
  ok('agregado classifica o risco do setor',
    producao.nivel === 'alto', `${producao.nivel} (${producao.indiceRisco})`);

  r = await pedir('GET', '/api/bi/serie', { token: chave });
  ok('série agrupa por dia', r.dados.dados.length === 2 && r.dados.separadoPorSetor === false);

  r = await pedir('GET', '/api/bi/serie?porSetor=true', { token: chave });
  ok('série separada por setor traz o setor em cada linha',
    r.dados.separadoPorSetor === true && r.dados.dados.every((l) => typeof l.setor === 'string'));

  // -------------------------------------------------------------------------
  secao('FILTRO DE DATAS');

  const hojeISO = new Date().toISOString().slice(0, 10);
  r = await pedir('GET', `/api/bi/completo?de=${hojeISO}`, { token: chave });
  ok('filtro "de" corta o que é anterior', r.dados.total === 1, String(r.dados.total));

  r = await pedir('GET', '/api/bi/completo?de=nao-e-data', { token: chave });
  ok('data inválida não quebra a rota', r.status === 200);

  // -------------------------------------------------------------------------
  secao('REVOGAÇÃO');

  r = await pedir('DELETE', `/api/bi/chaves/${idChave}`, { token: tokenGestor });
  ok('gestor comum não revoga chave', r.status === 403);

  r = await pedir('DELETE', `/api/bi/chaves/${idChave}`, { token: tokenAdmin });
  ok('admin revoga a chave', r.status === 200);

  r = await pedir('GET', '/api/bi/completo', { token: chave });
  ok('chave revogada para de funcionar na hora', r.status === 401, String(r.status));

  r = await pedir('GET', '/api/bi/chaves', { token: tokenAdmin });
  ok('listagem mostra a chave como revogada', r.dados[0].situacao === 'revogada');

  // A chave revogada continua registrada: apagar a linha faria a auditoria
  // perder o rastro de que ela existiu.
  ok('chave revogada continua no histórico', (await TokenBI.countDocuments()) === 1);

  // -------------------------------------------------------------------------
  secao('CHAVE VENCIDA');

  r = await pedir('POST', '/api/bi/chaves', {
    token: tokenAdmin, corpo: { nome: 'Vai vencer', dias: 1 },
  });
  const chaveVencida = r.dados.chave;
  const registroVencido = await TokenBI.findById(r.dados.id);
  registroVencido.expiraEm = new Date(Date.now() - 1000);
  await registroVencido.save();

  r = await pedir('GET', '/api/bi/completo', { token: chaveVencida });
  ok('chave vencida é recusada', r.status === 401, String(r.status));

  // -------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`  ${passou} passaram, ${falhou} falharam`);
  if (falhas.length > 0) console.log(`  Falharam: ${falhas.join(', ')}`);
  console.log('====================================================');
  process.exit(falhou > 0 ? 1 : 0);
}

const servidor = app.listen(0, '127.0.0.1', () => {
  base = `http://127.0.0.1:${servidor.address().port}`;
  rodar().catch((erro) => {
    console.error('\nErro inesperado:', erro);
    process.exit(1);
  });
});
