// testes/testar-api.js
// Testa as rotas da API subindo o servidor Express de verdade, com o banco
// substituído pela versão em memória (mongo-falso.js).
//
// Rode com:  npm test
//
// O que é testado de verdade aqui: as rotas HTTP, a autenticação por JWT, as
// permissões de administrador, o CRUD de contas e as agregações do painel.

process.env.JWT_SECRET = 'chave-de-teste-nao-usar-em-producao-1234567890';

const express = require('express');
const path = require('path');
const { instalar } = require('./mongo-falso');
const { Resposta } = require('../models/Resposta');
const { Usuario } = require('../models/Usuario');
const { LogAcesso } = require('../models/LogAcesso');
const { AcaoAlerta } = require('../models/AcaoAlerta');
const { seguranca } = require('../middleware/seguranca');

// Substitui o acesso ao banco ANTES de carregar as rotas
instalar(Resposta, { datas: ['data_envio'] });
instalar(Usuario, { unicos: ['email'], datas: ['ultimoAcesso', 'createdAt', 'updatedAt'] });
instalar(LogAcesso, { datas: ['data'] });
instalar(AcaoAlerta, { datas: ['criadoEm'] });

const authRouter = require('../routes/auth');
const usuariosRouter = require('../routes/usuarios');
const logsRouter = require('../routes/logs');
const respostasRouter = require('../routes/respostas');

const app = express();
app.use(express.json());
app.use(seguranca);
app.use(express.static(path.join(__dirname, '..', 'public')));
// Mesma rota de saude do server.js, para os testes cobrirem o caminho que a
// hospedagem usa para saber se a aplicacao esta de pe.
app.get('/api/saude', (req, res) => {
  res.json({ ok: true, banco: 'simulado', versao: require('../package.json').version });
});

app.use('/api/auth', authRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/logs', logsRouter);
app.use('/api/respostas', respostasRouter);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota da API não encontrada.' }));

// ---------------------------------------------------------------------------

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

function secao(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

let servidor;
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

  const tipo = resposta.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await resposta.json() : await resposta.text();
  return { status: resposta.status, dados, headers: resposta.headers };
}

// ---------------------------------------------------------------------------

async function rodar() {
  secao('PREPARAÇÃO');

  const admin = new Usuario({ nome: 'Pedro Marques', email: 'pedro@ceeppg.br', papel: 'admin' });
  await admin.definirSenha('senha123');
  await admin.save();
  ok('administrador criado', !!admin._id);

  const gestor = new Usuario({ nome: 'Ana Gestora', email: 'ana@ceeppg.br', papel: 'gestor' });
  await gestor.definirSenha('senha456');
  await gestor.save();
  ok('gestor criado', !!gestor._id);

  // Respostas com valores conhecidos, para conferir as médias na mão
  const agora = new Date();
  const ontem = new Date(agora); ontem.setDate(ontem.getDate() - 1);
  const mesPassado = new Date(agora); mesPassado.setDate(mesPassado.getDate() - 45);

  await Resposta.insertMany([
    { setor: 'Producao', turno: 'Noite', estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 1, data_envio: agora, comentario: 'Muito pesado hoje' },
    { setor: 'Producao', turno: 'Tarde', estresse: 4, sono: 2, carga_trabalho: 4, ambiente_fisico: 2, data_envio: agora },
    { setor: 'Producao', turno: 'Noite', estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 2, data_envio: ontem },
    { setor: 'TI', turno: 'Manha', estresse: 2, sono: 4, carga_trabalho: 2, ambiente_fisico: 5, data_envio: agora },
    { setor: 'TI', turno: 'Manha', estresse: 1, sono: 5, carga_trabalho: 2, ambiente_fisico: 4, data_envio: ontem },
    { setor: 'TI', turno: 'Tarde', estresse: 2, sono: 4, carga_trabalho: 1, ambiente_fisico: 5, data_envio: ontem },
    { setor: 'Qualidade', turno: 'Manha', estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3, data_envio: mesPassado },
  ]);
  ok('7 respostas inseridas', (await Resposta.countDocuments()) === 7);

  // -------------------------------------------------------------------------
  secao('LOGIN');

  let r = await pedir('POST', '/api/auth/login', { corpo: { email: 'pedro@ceeppg.br', senha: 'errada' } });
  ok('senha errada barrada', r.status === 401, `status ${r.status}`);
  ok('mensagem generica (nao revela se o email existe)',
    r.dados.erro === 'E-mail ou senha incorretos.', r.dados.erro);

  r = await pedir('POST', '/api/auth/login', { corpo: { email: 'naoexiste@x.com', senha: 'qualquer' } });
  ok('email inexistente barrado', r.status === 401);
  ok('mesma mensagem para email inexistente',
    r.dados.erro === 'E-mail ou senha incorretos.', r.dados.erro);

  r = await pedir('POST', '/api/auth/login', { corpo: { email: 'pedro@ceeppg.br' } });
  ok('login sem senha barrado', r.status === 400);

  r = await pedir('POST', '/api/auth/login', { corpo: { email: 'pedro@ceeppg.br', senha: 'senha123' } });
  ok('login correto', r.status === 200, `status ${r.status}`);
  ok('devolve token', typeof r.dados.token === 'string');
  ok('devolve dados do usuario', r.dados.usuario && r.dados.usuario.email === 'pedro@ceeppg.br');
  ok('resposta do login nao vaza o hash da senha',
    !JSON.stringify(r.dados).includes('senhaHash') && !JSON.stringify(r.dados).includes('$2'));
  const tokenAdmin = r.dados.token;

  r = await pedir('POST', '/api/auth/login', { corpo: { email: 'PEDRO@CEEPPG.BR', senha: 'senha123' } });
  ok('email aceita maiusculas', r.status === 200, `status ${r.status}`);

  r = await pedir('POST', '/api/auth/login', { corpo: { email: 'ana@ceeppg.br', senha: 'senha456' } });
  const tokenGestor = r.dados.token;
  ok('gestor consegue entrar', r.status === 200);

  r = await pedir('GET', '/api/auth/eu', { token: tokenAdmin });
  ok('rota /eu identifica quem esta logado', r.dados.email === 'pedro@ceeppg.br');

  // -------------------------------------------------------------------------
  secao('PROTEÇÃO DAS ROTAS');

  r = await pedir('GET', '/api/respostas/resumo');
  ok('painel sem token barrado', r.status === 401);

  r = await pedir('GET', '/api/respostas/resumo', { token: 'token-inventado' });
  ok('token invalido barrado', r.status === 401);

  r = await pedir('GET', '/api/usuarios', { token: tokenGestor });
  ok('gestor PODE listar contas', r.status === 200, `status ${r.status}`);

  r = await pedir('POST', '/api/usuarios', {
    token: tokenGestor,
    corpo: { nome: 'Intruso', email: 'intruso@x.com', senha: 'senha123' },
  });
  ok('gestor NAO pode criar conta', r.status === 403, `status ${r.status}`);

  r = await pedir('GET', '/api/naoexiste', { token: tokenAdmin });
  ok('rota inexistente devolve JSON 404', r.status === 404 && !!r.dados.erro);

  // -------------------------------------------------------------------------
  secao('FORMULÁRIO (rota pública)');

  r = await pedir('POST', '/api/respostas', {
    corpo: { setor: 'Logistica', turno: 'Manha', estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3 },
  });
  ok('envio sem login funciona', r.status === 201, `status ${r.status}`);

  r = await pedir('POST', '/api/respostas', {
    corpo: { setor: 'SetorFalso', estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3 },
  });
  ok('setor inventado barrado', r.status === 400, `status ${r.status}`);

  r = await pedir('POST', '/api/respostas', {
    corpo: { setor: 'TI', estresse: 9, sono: 3, carga_trabalho: 3, ambiente_fisico: 3 },
  });
  ok('nota fora da escala barrada', r.status === 400);

  r = await pedir('POST', '/api/respostas', {
    corpo: { setor: 'TI', estresse: 3.5, sono: 3, carga_trabalho: 3, ambiente_fisico: 3 },
  });
  ok('nota quebrada barrada', r.status === 400);

  r = await pedir('POST', '/api/respostas', { corpo: { setor: 'TI' } });
  ok('campos faltando barrados', r.status === 400);
  // Procurar acento nao serve como criterio: "Selecione o seu turno." esta em
  // portugues e nao tem nenhum. Conferimos por palavras que so existem em
  // mensagens nossas, ja traduzidas.
  ok('erro vem em portugues',
    /(Selecione|Responda|deve ser|obrigat)/i.test(r.dados.erro || ''), r.dados.erro);

  r = await pedir('POST', '/api/respostas', {
    corpo: {
      setor: 'TI', turno: 'Manha', estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3,
      comentario: 'a'.repeat(600),
    },
  });
  ok('comentario acima de 500 barrado', r.status === 400);

  // -------------------------------------------------------------------------
  secao('PAINEL — cálculos');

  r = await pedir('GET', '/api/respostas/resumo?periodo=tudo', { token: tokenAdmin });
  ok('resumo carrega', r.status === 200, `status ${r.status}`);

  const setores = r.dados.porSetor;
  const producao = setores.find((s) => s.setor === 'Producao');
  const ti = setores.find((s) => s.setor === 'TI');

  // Producao: estresse (5+4+5)/3 = 4.667 | sono (1+2+1)/3 = 1.333
  ok('media de estresse da Producao correta',
    Math.abs(producao.media_estresse - 14 / 3) < 0.01, String(producao.media_estresse));
  ok('media de sono da Producao correta',
    Math.abs(producao.media_sono - 4 / 3) < 0.01, String(producao.media_sono));

  // Indice da Producao: (4.667 + (6-1.333) + 4.667 + (6-1.667)) / 4 = 4.583
  ok('Producao classificada como risco alto',
    producao.classificacao.nivel === 'alto', producao.classificacao.rotulo);
  ok('TI classificada como risco baixo',
    ti.classificacao.nivel === 'baixo', `${ti.classificacao.rotulo} (${ti.indiceRisco})`);
  ok('nome do setor acentuado',
    producao.setorNome === 'Produção', producao.setorNome);

  ok('alerta gerado para a Producao',
    r.dados.alertas.some((a) => a.setor === 'Producao' && a.gravidade === 'alto'));
  ok('nenhum alerta para TI',
    !r.dados.alertas.some((a) => a.setor === 'TI'));

  const recProducao = r.dados.recomendacoesPorSetor.find((s) => s.setor === 'Producao');
  ok('recomendacoes geradas para a Producao', !!recProducao && recProducao.recomendacoes.length > 0);
  ok('recomendacao aponta estresse e carga',
    recProducao.recomendacoes.some((x) => x.indicador === 'estresse') &&
    recProducao.recomendacoes.some((x) => x.indicador === 'carga_trabalho'));
  ok('TI nao aparece nas recomendacoes',
    !r.dados.recomendacoesPorSetor.some((s) => s.setor === 'TI'));
  ok('setor em alerta comeca sem acao registrada', recProducao.ultimaAcao === null);

  // -------------------------------------------------------------------------
  secao('AÇÃO PÓS-ALERTA');

  r = await pedir('POST', '/api/respostas/setores/SetorFalso/acao', { token: tokenAdmin });
  ok('setor invalido barrado', r.status === 400, `status ${r.status}`);

  r = await pedir('POST', '/api/respostas/setores/Producao/acao', {});
  ok('exige login', r.status === 401, `status ${r.status}`);

  r = await pedir('POST', '/api/respostas/setores/Producao/acao', {
    token: tokenAdmin,
    corpo: { observacao: 'Conversamos com a liderança do turno da noite.' },
  });
  ok('acao registrada', r.status === 201, `status ${r.status}`);
  ok('acao traz quem registrou', r.dados.criadoPor === 'Pedro Marques', r.dados.criadoPor);

  const resumoComAcao = await pedir('GET', '/api/respostas/resumo?periodo=tudo', { token: tokenAdmin });
  const producaoComAcao = resumoComAcao.dados.recomendacoesPorSetor.find((s) => s.setor === 'Producao');
  ok('resumo passa a trazer a ultima acao do setor',
    !!producaoComAcao.ultimaAcao && producaoComAcao.ultimaAcao.criadoPor === 'Pedro Marques');
  ok('efeito comeca nulo: ainda nao ha respostas depois da acao',
    producaoComAcao.ultimaAcao.efeito === null, JSON.stringify(producaoComAcao.ultimaAcao.efeito));

  // A rota exige só login, não papel de administrador — um gestor também
  // pode marcar que agiu sobre um alerta.
  r = await pedir('POST', '/api/respostas/setores/Producao/acao', {
    token: tokenGestor,
    corpo: { observacao: 'Gestora também acompanhou o caso.' },
  });
  ok('gestor tambem pode registrar acao pos-alerta', r.status === 201, `status ${r.status}`);

  r = await pedir('POST', '/api/respostas/setores/Producao/acao', {
    token: tokenAdmin,
    corpo: { observacao: 'a'.repeat(301) },
  });
  ok('observacao acima de 300 caracteres barrada', r.status === 400, `status ${r.status}`);

  // A rota exigia só login, sem nenhum teto de tentativas — um token vazado
  // conseguiria despejar linhas em acoes_alerta sem limite. Mesma técnica do
  // teste de força bruta do login, adaptada para esta rota (agora por
  // usuário, não por IP — ver middleware/limites.js).
  let bloqueouAcao = false;
  for (let i = 0; i < 20; i++) {
    const tentativa = await pedir('POST', '/api/respostas/setores/Producao/acao', {
      token: tokenAdmin,
      corpo: { observacao: `ação em lote ${i}` },
    });
    if (tentativa.status === 429) { bloqueouAcao = true; break; }
  }
  ok('limite de tentativas na acao pos-alerta bloqueia abuso', bloqueouAcao);

  // -------------------------------------------------------------------------
  secao('PAINEL — filtro de período');

  const tudo = await pedir('GET', '/api/respostas/resumo?periodo=tudo', { token: tokenAdmin });
  const sete = await pedir('GET', '/api/respostas/resumo?periodo=7', { token: tokenAdmin });

  ok('periodo=tudo inclui a resposta antiga', tudo.dados.geral.total === 8, String(tudo.dados.geral.total));
  ok('periodo=7 exclui a resposta de 45 dias atras',
    sete.dados.geral.total === 7, String(sete.dados.geral.total));
  ok('rotulo do periodo correto', sete.dados.periodo === 'Últimos 7 dias', sete.dados.periodo);
  ok('setor Qualidade some no filtro de 7 dias',
    !sete.dados.porSetor.some((s) => s.setor === 'Qualidade'));

  r = await pedir('GET', '/api/respostas/resumo?periodo=xyz', { token: tokenAdmin });
  ok('periodo invalido cai no padrao', r.dados.periodo === 'Todo o período', r.dados.periodo);

  // -------------------------------------------------------------------------
  secao('PAINEL — evolução e comentários');

  r = await pedir('GET', '/api/respostas/evolucao?periodo=7', { token: tokenAdmin });
  ok('evolucao carrega', r.status === 200);
  ok('agrupa por dia', Array.isArray(r.dados) && r.dados.length >= 2, `${r.dados.length} dias`);
  ok('dias em ordem crescente',
    r.dados.every((d, i) => i === 0 || d.dia >= r.dados[i - 1].dia));
  ok('cada dia tem indice de risco',
    r.dados.every((d) => typeof d.indiceRisco === 'number' && d.indiceRisco >= 1 && d.indiceRisco <= 5));

  r = await pedir('GET', '/api/respostas/comentarios', { token: tokenAdmin });
  ok('comentarios carregam', r.status === 200);
  ok('so traz quem tem comentario',
    r.dados.comentarios.every((c) => c.comentario && c.comentario.trim() !== ''),
    `${r.dados.comentarios.length} itens`);
  ok('comentario vem classificado por risco',
    r.dados.comentarios.length === 0 || !!r.dados.comentarios[0].classificacao);

  // -------------------------------------------------------------------------
  secao('EXPORTAÇÃO CSV');

  const csvResp = await fetch(base + '/api/respostas/exportar?periodo=tudo', {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  // Lemos os bytes brutos porque o .text() do fetch remove o BOM ao decodificar,
  // o que faria o teste falhar mesmo com o arquivo correto.
  const csvBytes = Buffer.from(await csvResp.arrayBuffer());
  const csv = csvBytes.toString('utf8').replace(/^\uFEFF/, '');

  ok('CSV responde 200', csvResp.status === 200);
  ok('cabecalho de download presente',
    (csvResp.headers.get('content-disposition') || '').includes('attachment'));
  ok('comeca com BOM (Excel le acentos)',
    csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF,
    [...csvBytes.slice(0, 3)].map((b) => b.toString(16)).join(' '));
  ok('usa ponto e virgula como separador', csv.split('\n')[0].includes(';'));
  ok('tem uma linha por resposta + cabecalho',
    csv.trim().split('\r\n').length === 9, String(csv.trim().split('\r\n').length));
  ok('nome do setor acentuado no CSV', csv.includes('Produção'));
  ok('decimal com virgula', /\d,\d\d;/.test(csv));

  // Proteção contra "formula injection": um comentário começando com =, +,
  // - ou @ não pode virar fórmula executável ao abrir o CSV no Excel.
  await pedir('POST', '/api/respostas', {
    corpo: {
      setor: 'TI', turno: 'Manha', estresse: 1, sono: 1, carga_trabalho: 1, ambiente_fisico: 1,
      comentario: "=cmd|'/c calc'!A1",
    },
  });
  const csvInjResp = await fetch(base + '/api/respostas/exportar?periodo=tudo', {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  const csvInj = (await csvInjResp.text()).replace(/^﻿/, '');
  ok('comentario com formula vem prefixado com apostrofo',
    csvInj.includes("'=cmd|'/c calc'!A1") && !csvInj.includes(";=cmd|"), csvInj);

  // -------------------------------------------------------------------------
  secao('CRUD DE CONTAS');

  r = await pedir('POST', '/api/usuarios', {
    token: tokenAdmin,
    corpo: { nome: 'Carlos Novo', email: 'carlos@ceeppg.br', senha: 'senha789', papel: 'gestor' },
  });
  ok('CREATE: conta criada', r.status === 201, `status ${r.status}`);
  ok('CREATE: resposta sem hash de senha', !JSON.stringify(r.dados).includes('senhaHash'));
  const idCarlos = r.dados.usuario.id;

  r = await pedir('POST', '/api/usuarios', {
    token: tokenAdmin,
    corpo: { nome: 'Outro', email: 'carlos@ceeppg.br', senha: 'senha789' },
  });
  ok('CREATE: email duplicado barrado', r.status === 409, `status ${r.status}`);

  r = await pedir('POST', '/api/usuarios', {
    token: tokenAdmin,
    corpo: { nome: 'Curto', email: 'curto@x.com', senha: '123' },
  });
  ok('CREATE: senha curta barrada', r.status === 400);

  r = await pedir('POST', '/api/usuarios', {
    token: tokenAdmin,
    corpo: { nome: 'Sem Email', email: 'nao-e-email', senha: 'senha123' },
  });
  ok('CREATE: email invalido barrado', r.status === 400);

  r = await pedir('GET', '/api/usuarios', { token: tokenAdmin });
  ok('READ: lista as contas', r.status === 200 && r.dados.length === 3, `${r.dados.length} contas`);
  ok('READ: nenhum hash na listagem', !JSON.stringify(r.dados).includes('senhaHash'));
  ok('READ: ordenado por nome',
    r.dados[0].nome <= r.dados[1].nome, r.dados.map((u) => u.nome).join(', '));

  r = await pedir('GET', `/api/usuarios/${idCarlos}`, { token: tokenAdmin });
  ok('READ: detalha uma conta', r.status === 200 && r.dados.email === 'carlos@ceeppg.br');

  r = await pedir('GET', '/api/usuarios/000000000000000000000000', { token: tokenAdmin });
  ok('READ: conta inexistente devolve 404', r.status === 404, `status ${r.status}`);

  r = await pedir('PUT', `/api/usuarios/${idCarlos}`, {
    token: tokenAdmin,
    corpo: { nome: 'Carlos Editado', papel: 'admin' },
  });
  ok('UPDATE: conta atualizada', r.status === 200 && r.dados.usuario.nome === 'Carlos Editado');
  ok('UPDATE: papel alterado', r.dados.usuario.papel === 'admin');

  r = await pedir('PUT', `/api/usuarios/${idCarlos}`, {
    token: tokenAdmin, corpo: { senha: 'novasenha123' },
  });
  ok('UPDATE: senha trocada', r.status === 200);

  r = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'carlos@ceeppg.br', senha: 'novasenha123' },
  });
  ok('UPDATE: login com a senha nova funciona', r.status === 200, `status ${r.status}`);

  r = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'carlos@ceeppg.br', senha: 'senha789' },
  });
  ok('UPDATE: senha antiga deixou de valer', r.status === 401);

  // -------------------------------------------------------------------------
  secao('TRAVAS DE SEGURANÇA');

  const meuId = (await pedir('GET', '/api/auth/eu', { token: tokenAdmin })).dados.id;

  r = await pedir('PUT', `/api/usuarios/${meuId}`, {
    token: tokenAdmin, corpo: { papel: 'gestor' },
  });
  ok('nao pode rebaixar a propria conta', r.status === 400, `status ${r.status}`);

  r = await pedir('PUT', `/api/usuarios/${meuId}`, {
    token: tokenAdmin, corpo: { ativo: false },
  });
  ok('nao pode desativar a propria conta', r.status === 400);

  r = await pedir('DELETE', `/api/usuarios/${meuId}`, { token: tokenAdmin });
  ok('nao pode remover a propria conta', r.status === 400);

  // Desativa o Carlos e confirma que o acesso dele para de funcionar
  r = await pedir('PUT', `/api/usuarios/${idCarlos}`, {
    token: tokenAdmin, corpo: { ativo: false },
  });
  ok('conta desativada com sucesso', r.status === 200);

  r = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'carlos@ceeppg.br', senha: 'novasenha123' },
  });
  ok('conta desativada nao consegue entrar', r.status === 403, `status ${r.status}`);

  // -------------------------------------------------------------------------
  secao('EXCLUSÃO');

  r = await pedir('DELETE', `/api/usuarios/${idCarlos}`, { token: tokenAdmin });
  ok('DELETE: conta removida', r.status === 200, `status ${r.status}`);

  r = await pedir('GET', `/api/usuarios/${idCarlos}`, { token: tokenAdmin });
  ok('DELETE: conta some da listagem', r.status === 404);

  // Sobrou só um admin (Pedro) — o sistema deve impedir removê-lo
  const idAna = (await pedir('GET', '/api/usuarios', { token: tokenAdmin }))
    .dados.find((u) => u.email === 'ana@ceeppg.br').id;
  r = await pedir('DELETE', `/api/usuarios/${idAna}`, { token: tokenAdmin });
  ok('DELETE: gestor comum pode ser removido', r.status === 200, `status ${r.status}`);

  // Cria um segundo admin, promove, e confirma que o ÚLTIMO admin ativo é
  // protegido — mas que um admin desativado pode ser removido normalmente.
  r = await pedir('POST', '/api/usuarios', {
    token: tokenAdmin,
    corpo: { nome: 'Admin Dois', email: 'admin2@ceeppg.br', senha: 'senha123', papel: 'admin' },
  });
  const idAdmin2 = r.dados.usuario.id;
  ok('segundo admin criado', r.status === 201);

  r = await pedir('DELETE', `/api/usuarios/${idAdmin2}`, { token: tokenAdmin });
  ok('admin ativo pode ser removido quando existe outro', r.status === 200, `status ${r.status}`);

  // Agora Pedro é o último admin ativo. Um gestor tentando removê-lo já seria
  // barrado por permissão, então testamos a trava criando e desativando outro.
  r = await pedir('POST', '/api/usuarios', {
    token: tokenAdmin,
    corpo: { nome: 'Admin Tres', email: 'admin3@ceeppg.br', senha: 'senha123', papel: 'admin' },
  });
  const idAdmin3 = r.dados.usuario.id;
  await pedir('PUT', `/api/usuarios/${idAdmin3}`, { token: tokenAdmin, corpo: { ativo: false } });

  r = await pedir('DELETE', `/api/usuarios/${idAdmin3}`, { token: tokenAdmin });
  ok('admin DESATIVADO pode ser removido (nao trava o sistema)',
    r.status === 200, `status ${r.status} - ${r.dados.erro || ''}`);

  // -------------------------------------------------------------------------
  secao('HISTÓRICO DE ACESSOS');

  // A Ana foi removida na seção anterior, então criamos um gestor novo para
  // testar as permissões daqui em diante.
  r = await pedir('POST', '/api/usuarios', {
    token: tokenAdmin,
    corpo: { nome: 'Bia Gestora', email: 'bia@ceeppg.br', senha: 'senha456', papel: 'gestor' },
  });
  ok('gestor de teste recriado', r.status === 201, `status ${r.status}`);

  r = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'bia@ceeppg.br', senha: 'senha456' },
  });
  const tokenBia = r.dados.token;
  ok('gestor novo consegue entrar', r.status === 200, `status ${r.status}`);

  r = await pedir('GET', '/api/logs', { token: tokenAdmin });
  ok('admin acessa o historico', r.status === 200, `status ${r.status}`);
  ok('registrou os logins do teste', Array.isArray(r.dados) && r.dados.length > 0,
    `${r.dados.length} registros`);

  const logs = r.dados;
  ok('registrou entrada bem-sucedida', logs.some((l) => l.sucesso && l.motivo === 'ok'));
  ok('registrou senha incorreta', logs.some((l) => !l.sucesso && l.motivo === 'senha_incorreta'));
  ok('registrou conta inexistente', logs.some((l) => l.motivo === 'usuario_inexistente'));
  ok('registrou conta desativada', logs.some((l) => l.motivo === 'conta_desativada'));
  ok('traz descricao em portugues', logs.every((l) => !!l.motivoTexto));
  ok('mais recente primeiro',
    logs.every((l, i) => i === 0 || new Date(l.data) <= new Date(logs[i - 1].data)));

  ok('NAO guarda nenhuma senha no historico', !JSON.stringify(logs).includes('senha123')
    && !JSON.stringify(logs).includes('senha-errada'));

  r = await pedir('GET', '/api/logs', { token: tokenBia });
  ok('gestor NAO ve o historico', r.status === 403, `status ${r.status}`);

  r = await pedir('GET', '/api/logs');
  ok('historico bloqueado sem login', r.status === 401);

  r = await pedir('GET', '/api/logs?apenas=falhas', { token: tokenAdmin });
  ok('filtro de falhas funciona', r.dados.every((l) => l.sucesso === false),
    `${r.dados.length} falhas`);

  r = await pedir('GET', '/api/logs?apenas=sucessos', { token: tokenAdmin });
  ok('filtro de sucessos funciona', r.dados.every((l) => l.sucesso === true));

  r = await pedir('GET', '/api/logs/resumo', { token: tokenAdmin });
  ok('resumo do historico carrega', r.status === 200);
  ok('resumo conta sucessos e falhas',
    r.dados.geral.total === r.dados.geral.sucessos + r.dados.geral.falhas,
    `${r.dados.geral.sucessos}+${r.dados.geral.falhas}=${r.dados.geral.total}`);

  // Três falhas seguidas na mesma conta devem virar alerta de suspeita
  for (let i = 0; i < 3; i++) {
    await pedir('POST', '/api/auth/login', {
      corpo: { email: 'alvo@ceeppg.br', senha: `tentativa${i}` },
    });
  }
  r = await pedir('GET', '/api/logs/resumo', { token: tokenAdmin });
  ok('detecta conta com muitas falhas seguidas',
    r.dados.suspeitos.some((s) => s.email === 'alvo@ceeppg.br' && s.falhas >= 3),
    JSON.stringify(r.dados.suspeitos));

  // -------------------------------------------------------------------------
  secao('TROCAR A PRÓPRIA SENHA');

  r = await pedir('POST', '/api/auth/trocar-senha', {
    token: tokenBia, corpo: { senhaAtual: 'errada', senhaNova: 'novasenha123' },
  });
  ok('senha atual errada barra a troca', r.status === 401, `status ${r.status}`);

  r = await pedir('POST', '/api/auth/trocar-senha', {
    token: tokenBia, corpo: { senhaAtual: 'senha456', senhaNova: '123' },
  });
  ok('senha nova curta barrada', r.status === 400);

  r = await pedir('POST', '/api/auth/trocar-senha', {
    token: tokenBia, corpo: { senhaAtual: 'senha456', senhaNova: 'senha456' },
  });
  ok('senha nova igual a atual barrada', r.status === 400, r.dados.erro);

  r = await pedir('POST', '/api/auth/trocar-senha', {
    corpo: { senhaAtual: 'senha456', senhaNova: 'outrasenha' },
  });
  ok('troca de senha exige login', r.status === 401);

  r = await pedir('POST', '/api/auth/trocar-senha', {
    token: tokenBia, corpo: { senhaAtual: 'senha456', senhaNova: 'senhanova789' },
  });
  ok('troca de senha funciona', r.status === 200, `status ${r.status}`);

  r = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'bia@ceeppg.br', senha: 'senhanova789' },
  });
  ok('entra com a senha nova', r.status === 200, `status ${r.status}`);
  const tokenBiaNovo = r.dados.token;

  r = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'bia@ceeppg.br', senha: 'senha456' },
  });
  ok('senha antiga deixou de valer', r.status === 401);

  // Devolve a senha original para os testes seguintes continuarem valendo
  await pedir('POST', '/api/auth/trocar-senha', {
    token: tokenBiaNovo, corpo: { senhaAtual: 'senhanova789', senhaNova: 'senha456' },
  });

  // -------------------------------------------------------------------------
  secao('TURNO');

  r = await pedir('POST', '/api/respostas', {
    corpo: { setor: 'TI', turno: 'Noite', estresse: 5, sono: 1, carga_trabalho: 4, ambiente_fisico: 2 },
  });
  ok('aceita resposta com turno', r.status === 201, `status ${r.status}`);

  r = await pedir('POST', '/api/respostas', {
    corpo: { setor: 'TI', turno: 'Vespertino', estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3 },
  });
  ok('turno inventado barrado', r.status === 400, `status ${r.status}`);

  r = await pedir('POST', '/api/respostas', {
    corpo: { setor: 'TI', estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3 },
  });
  ok('resposta sem turno barrada', r.status === 400, `status ${r.status}`);

  await pedir('POST', '/api/respostas', {
    corpo: { setor: 'Producao', turno: 'Manha', estresse: 2, sono: 4, carga_trabalho: 2, ambiente_fisico: 4 },
  });
  await pedir('POST', '/api/respostas', {
    corpo: { setor: 'Producao', turno: 'Noite', estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 1 },
  });

  r = await pedir('GET', '/api/respostas/resumo?periodo=tudo', { token: tokenAdmin });
  const turnos = r.dados.porTurno;
  ok('resumo traz dados por turno', Array.isArray(turnos) && turnos.length > 0,
    `${turnos ? turnos.length : 0} turnos`);
  ok('turnos na ordem do dia (manha, tarde, noite)',
    turnos.map((t) => t.turno).join(',') === turnos
      .map((t) => t.turno)
      .sort((a, b) => ['Manha', 'Tarde', 'Noite'].indexOf(a) - ['Manha', 'Tarde', 'Noite'].indexOf(b))
      .join(','),
    turnos.map((t) => t.turno).join(','));
  ok('nome do turno acentuado',
    turnos.every((t) => !!t.turnoNome),
    turnos.map((t) => t.turnoNome).join(', '));
  ok('cada turno tem indice de risco',
    turnos.every((t) => t.indiceRisco >= 1 && t.indiceRisco <= 5));
  ok('respostas sem turno NAO viram um turno vazio',
    turnos.every((t) => t.turno !== null && t.turno !== undefined));

  const noite = turnos.find((t) => t.turno === 'Noite');
  const manha = turnos.find((t) => t.turno === 'Manha');
  if (noite && manha) {
    ok('turno da noite com risco maior que o da manha (dados de teste)',
      noite.indiceRisco > manha.indiceRisco,
      `noite ${noite.indiceRisco} vs manha ${manha.indiceRisco}`);
  }

  // Rota dedicada, usada por quem quiser só os turnos
  r = await pedir('GET', '/api/respostas/turnos?periodo=tudo', { token: tokenAdmin });
  ok('rota /turnos funciona', r.status === 200 && Array.isArray(r.dados), `status ${r.status}`);

  r = await pedir('GET', '/api/respostas/turnos');
  ok('rota /turnos exige login', r.status === 401);

  const csvTurno = await fetch(base + '/api/respostas/exportar?periodo=tudo', {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  const textoCsv = Buffer.from(await csvTurno.arrayBuffer()).toString('utf8');
  ok('CSV tem coluna de turno', textoCsv.split('\r\n')[0].includes('Turno'));
  ok('CSV mostra turno acentuado', textoCsv.includes('Manhã') || textoCsv.includes('Noite'));
  // Registros antigos (sem turno) apareceriam como "Nao informado"; como o
  // campo agora e obrigatorio, todos os novos trazem o turno preenchido.
  ok('CSV traz turno em toda linha nova',
    textoCsv.split('\r\n').slice(1).filter(Boolean)
      .every((l) => /;(Manhã|Tarde|Noite|Madrugada|Comercial|Nao informado);/.test(l)));

  // -------------------------------------------------------------------------
  secao('TENDÊNCIA');

  // Cria um setor com piora clara ao longo de 8 dias, para o cálculo ter base
  const hoje = new Date();
  for (let d = 7; d >= 0; d--) {
    const quando = new Date(hoje);
    quando.setDate(quando.getDate() - d);
    // Quanto mais recente, pior: estresse sobe e sono cai
    const gravidade = 8 - d; // 1 (mais antigo) a 8 (hoje)
    const estresse = Math.min(5, Math.max(1, Math.round(1 + gravidade * 0.5)));
    const sono = Math.min(5, Math.max(1, Math.round(6 - gravidade * 0.5)));
    for (let i = 0; i < 4; i++) {
      await Resposta.create({
        setor: 'Logistica', turno: 'Tarde',
        estresse, sono, carga_trabalho: estresse, ambiente_fisico: sono,
        data_envio: quando,
      });
    }
  }

  r = await pedir('GET', '/api/respostas/resumo?periodo=30', { token: tokenAdmin });
  const logistica = r.dados.porSetor.find((s) => s.setor === 'Logistica');

  ok('setor traz objeto de tendencia', !!logistica.tendencia, JSON.stringify(logistica.tendencia));
  ok('tendencia identificada como piorando',
    logistica.tendencia.direcao === 'piorando',
    `${logistica.tendencia.direcao} (variacao ${logistica.tendencia.variacao})`);
  ok('tendencia marcada como confiavel', logistica.tendencia.confiavel === true);
  ok('conta dias seguidos piorando', logistica.diasPiorando > 0, String(logistica.diasPiorando));

  const alertaLog = r.dados.alertas.find((a) => a.setor === 'Logistica');
  ok('alerta menciona a piora', !!alertaLog && /piora/i.test(alertaLog.mensagem),
    alertaLog ? alertaLog.mensagem : 'sem alerta');

  const recLog = r.dados.recomendacoesPorSetor.find((s) => s.setor === 'Logistica');
  ok('recomendacao traz urgencia', !!recLog && !!recLog.urgencia,
    recLog ? recLog.urgencia.rotulo : 'sem recomendacao');

  // Um setor cujos dados foram criados todos no mesmo instante não tem dias
  // suficientes: o sistema deve dizer isso em vez de inventar uma direção.
  const semSerie = r.dados.porSetor.find((s) => s.tendencia && !s.tendencia.confiavel);
  if (semSerie) {
    ok('nao afirma tendencia sem dias suficientes',
      semSerie.tendencia.direcao === 'indefinida', semSerie.tendencia.rotulo);
  }

  ok('recomendacoes ordenadas por urgencia',
    r.dados.recomendacoesPorSetor.every((s, i, arr) =>
      i === 0 || arr[i - 1].urgencia.peso <= s.urgencia.peso),
    r.dados.recomendacoesPorSetor.map((s) => `${s.setor}:${s.urgencia.peso}`).join(' '));

  // -------------------------------------------------------------------------
  secao('ROTA DE SAÚDE (usada pela hospedagem)');

  r = await pedir('GET', '/api/saude');
  ok('responde sem login', r.status === 200, `status ${r.status}`);
  ok('informa que está de pé', r.dados.ok === true);
  ok('informa o estado do banco', !!r.dados.banco, r.dados.banco);
  ok('informa a versão', !!r.dados.versao, r.dados.versao);

  // -------------------------------------------------------------------------
  secao('ANONIMATO — proteção contra identificar quem comentou');

  // Setor pequeno: uma única resposta, com comentário. Se ela aparecer no
  // painel, qualquer gestor que conheça a escala sabe quem escreveu.
  await new Resposta({
    setor: 'Administrativo', turno: 'Noite',
    estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 2,
    comentario: 'COMENTARIO DE SETOR PEQUENO — nao deve aparecer',
    data_envio: new Date(),
  }).save();

  r = await pedir('GET', '/api/respostas/comentarios', { token: tokenAdmin });
  ok('rota devolve objeto com contagem de ocultos',
    r.status === 200 && Array.isArray(r.dados.comentarios) && typeof r.dados.ocultos === 'number',
    JSON.stringify(r.dados).slice(0, 90));

  const textos = (r.dados.comentarios || []).map((c) => c.comentario).join(' | ');
  ok('comentário de setor pequeno NÃO é exposto',
    !textos.includes('COMENTARIO DE SETOR PEQUENO'));

  ok('painel é avisado de que existe comentário oculto', r.dados.ocultos >= 1, `ocultos=${r.dados.ocultos}`);

  ok('nenhum comentário devolve o turno',
    (r.dados.comentarios || []).every((c) => c.turno === undefined && c.turnoNome === undefined));

  ok('nenhum comentário devolve hora exata',
    (r.dados.comentarios || []).every((c) => c.data_envio === undefined
      && !/\d{1,2}:\d{2}/.test(String(c.data || ''))),
    (r.dados.comentarios || [])[0]?.data);

  // A contagem de ocultos precisa valer mesmo quando há MAIS comentários
  // visíveis do que a página devolve. A versão anterior decidia o que era
  // oculto dentro de um laço que parava ao juntar 20 visíveis, então os
  // ocultos que vinham depois disso nunca eram contados — e o painel podia
  // anunciar "nenhum comentário oculto" com comentários ocultos de verdade.
  const antesDoLote = (await pedir('GET', '/api/respostas/comentarios', { token: tokenAdmin })).dados.ocultos;

  const lote = [];
  for (let i = 0; i < 25; i++) {
    lote.push({
      setor: 'Producao', turno: 'Manha',
      estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3,
      comentario: `comentario de lote ${i}`,
      data_envio: new Date(),
    });
  }
  await Resposta.insertMany(lote);

  r = await pedir('GET', '/api/respostas/comentarios', { token: tokenAdmin });
  ok('ocultos continuam contados com a página de visíveis cheia',
    r.dados.comentarios.length === 20 && r.dados.ocultos >= antesDoLote,
    `visiveis=${r.dados.comentarios.length} ocultos=${r.dados.ocultos} (antes=${antesDoLote})`);

  ok('nenhum comentário de setor pequeno vaza mesmo com a página cheia',
    !(r.dados.comentarios || []).some((c) => c.comentario.includes('SETOR PEQUENO')));

  // -------------------------------------------------------------------------
  secao('TRAVA CONTRA ADIVINHAR SENHA');

  let bloqueou = false;
  let statusUltima = 0;
  for (let i = 0; i < 14; i++) {
    const tentativa = await pedir('POST', '/api/auth/login', {
      corpo: { email: 'forcabruta@ceeppg.br', senha: `chute-${i}` },
    });
    statusUltima = tentativa.status;
    if (tentativa.status === 429) { bloqueou = true; break; }
  }
  ok('bloqueia depois de muitas tentativas seguidas', bloqueou, `última status ${statusUltima}`);

  r = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'forcabruta@ceeppg.br', senha: 'x' },
  });
  ok('resposta de bloqueio diz quando tentar de novo', r.status === 429 && r.dados.tentarEmSegundos > 0);

  // A trava conta por IP + e-mail: uma pessoa errando a senha não pode
  // trancar o login de todo mundo que sai pelo mesmo endereço de rede.
  r = await pedir('POST', '/api/auth/login', {
    corpo: { email: 'pedro@ceeppg.br', senha: 'senha123' },
  });
  ok('trava não derruba o login de outra conta no mesmo IP', r.status === 200, `status ${r.status}`);

  // Como a chave da trava acima inclui o e-mail, variar o e-mail a cada
  // tentativa estreia sempre com o contador zerado. Sem um teto por IP em
  // cima dela, dava para disparar tentativa sem fim do mesmo lugar, sondando
  // quais contas existem e enchendo o histórico de acessos.
  let bloqueouPorIP = false;
  for (let i = 0; i < 60; i++) {
    const tentativa = await pedir('POST', '/api/auth/login', {
      corpo: { email: `varredura-${i}@ceeppg.br`, senha: 'x' },
    });
    if (tentativa.status === 429) { bloqueouPorIP = true; break; }
  }
  ok('teto por IP barra varredura que troca de e-mail a cada tentativa', bloqueouPorIP);

  // -------------------------------------------------------------------------
  secao('LIMITE DO FORMULÁRIO');

  // Rota pública e anônima: 30 envios por hora, por IP (ver
  // middleware/limites.js). Mesma técnica dos testes de força bruta acima.
  let bloqueouFormulario = false;
  for (let i = 0; i < 25; i++) {
    const tentativa = await pedir('POST', '/api/respostas', {
      corpo: { setor: 'TI', turno: 'Manha', estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3 },
    });
    if (tentativa.status === 429) { bloqueouFormulario = true; break; }
  }
  ok('limite de 30 envios por hora bloqueia envio em massa no formulário', bloqueouFormulario);

  // -------------------------------------------------------------------------
  secao('CABEÇALHOS DE SEGURANÇA');

  r = await pedir('GET', '/api/saude');
  ok('impede adivinhação de tipo de arquivo', r.headers.get('x-content-type-options') === 'nosniff');
  ok('impede carregar o sistema dentro de outro site', r.headers.get('x-frame-options') === 'DENY');
  ok('define política de conteúdo', !!r.headers.get('content-security-policy'));
  ok('política não libera script de fora',
    (r.headers.get('content-security-policy') || '').includes("script-src 'self'"));

  // -------------------------------------------------------------------------
  secao('EFEITO DA AÇÃO PÓS-ALERTA (antes/depois)');

  // Setor isolado, não usado em nenhuma outra seção deste arquivo — o teste
  // não depende de dados criados por nenhuma seção anterior nem interfere
  // com nenhuma assertiva já verificada.
  const inicioJanela = new Date();
  inicioJanela.setDate(inicioJanela.getDate() - 3);

  await Resposta.insertMany([
    { setor: 'Manutencao', turno: 'Manha', estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 1, data_envio: inicioJanela },
    { setor: 'Manutencao', turno: 'Tarde', estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 1, data_envio: inicioJanela },
    { setor: 'Manutencao', turno: 'Noite', estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 1, data_envio: inicioJanela },
  ]);

  // tokenBiaNovo, não tokenAdmin nem tokenGestor: o teste de limite de
  // tentativas logo acima já esgotou o teto da conta admin nesta rota de
  // propósito, e a conta da gestora original (Ana) foi removida na seção de
  // CRUD de contas, mais acima.
  r = await pedir('POST', '/api/respostas/setores/Manutencao/acao', {
    token: tokenBiaNovo,
    corpo: { observacao: 'Redistribuímos as tarefas do turno da noite.' },
  });
  ok('acao registrada para o teste de efeito', r.status === 201, `status ${r.status}`);
  const dataAcaoManutencao = new Date(r.dados.criadoEm);

  r = await pedir('GET', '/api/respostas/resumo?periodo=tudo', { token: tokenAdmin });
  let manutencao = r.dados.recomendacoesPorSetor.find((s) => s.setor === 'Manutencao');
  ok('efeito ainda nulo sem respostas depois da acao',
    !!manutencao && manutencao.ultimaAcao.efeito === null);

  // Respostas de "depois", com quadro bem melhor que o de "antes"
  const depoisDaAcao = new Date(dataAcaoManutencao.getTime() + 1000);
  await Resposta.insertMany([
    { setor: 'Manutencao', turno: 'Manha', estresse: 2, sono: 4, carga_trabalho: 2, ambiente_fisico: 4, data_envio: depoisDaAcao },
    { setor: 'Manutencao', turno: 'Tarde', estresse: 2, sono: 4, carga_trabalho: 2, ambiente_fisico: 4, data_envio: depoisDaAcao },
    { setor: 'Manutencao', turno: 'Noite', estresse: 2, sono: 4, carga_trabalho: 2, ambiente_fisico: 4, data_envio: depoisDaAcao },
  ]);

  r = await pedir('GET', '/api/respostas/resumo?periodo=tudo', { token: tokenAdmin });
  manutencao = r.dados.recomendacoesPorSetor.find((s) => s.setor === 'Manutencao');
  ok('efeito calculado com dados dos dois lados',
    !!manutencao && !!manutencao.ultimaAcao.efeito, JSON.stringify(manutencao && manutencao.ultimaAcao));
  ok('efeito aponta melhora (indice caiu depois da acao)',
    manutencao.ultimaAcao.efeito.direcao === 'melhorou', JSON.stringify(manutencao.ultimaAcao.efeito));
  ok('efeito traz indice de antes maior que o de depois',
    manutencao.ultimaAcao.efeito.indiceAntes > manutencao.ultimaAcao.efeito.indiceDepois,
    JSON.stringify(manutencao.ultimaAcao.efeito));

  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(52));
  console.log(`  ${passou} passaram, ${falhou} falharam`);
  if (falhou > 0) {
    console.log('\n  Falhas:');
    falhas.forEach((f) => console.log(`    - ${f}`));
  }
  console.log('='.repeat(52));
}

servidor = app.listen(0, async () => {
  base = `http://localhost:${servidor.address().port}`;
  try {
    await rodar();
  } catch (erro) {
    console.error('\nERRO DURANTE OS TESTES:', erro);
    falhou++;
  } finally {
    servidor.close();
    process.exit(falhou > 0 ? 1 : 0);
  }
});
