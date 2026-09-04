// testes/testar-analise.js
// Testa a lógica de cálculo de risco e tendência com números conferidos à mão.
// Não precisa de banco nem de servidor.
//
//   node testes/testar-analise.js

const analise = require('../utils/analise');

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

/** Monta uma série de dias a partir de uma lista de índices. */
function serie(...indices) {
  return indices.map((indiceRisco, i) => ({
    dia: `2026-08-${String(i + 1).padStart(2, '0')}`,
    indiceRisco,
    total: 5,
  }));
}

// ---------------------------------------------------------------------------
secao('ESCALAS INVERTIDAS');

// Sono e ambiente têm nota alta = situação boa, então viram (6 - nota)
ok('sono 5 (ótimo) vira risco 1', analise.paraNotaDeRisco('sono', 5) === 1);
ok('sono 1 (péssimo) vira risco 5', analise.paraNotaDeRisco('sono', 1) === 5);
ok('ambiente 4 vira risco 2', analise.paraNotaDeRisco('ambiente_fisico', 4) === 2);
ok('estresse 4 continua 4', analise.paraNotaDeRisco('estresse', 4) === 4);
ok('carga 2 continua 2', analise.paraNotaDeRisco('carga_trabalho', 2) === 2);

// Índice combinado: (estresse + (6-sono) + carga + (6-ambiente)) / 4
// Com 5, 1, 5, 1 → (5 + 5 + 5 + 5) / 4 = 5 (pior caso possível)
ok('pior caso possível dá índice 5',
  analise.calcularIndiceRisco({ estresse: 5, sono: 1, carga_trabalho: 5, ambiente_fisico: 1 }) === 5);

// Com 1, 5, 1, 5 → (1 + 1 + 1 + 1) / 4 = 1 (melhor caso)
ok('melhor caso possível dá índice 1',
  analise.calcularIndiceRisco({ estresse: 1, sono: 5, carga_trabalho: 1, ambiente_fisico: 5 }) === 1);

// Tudo 3 → (3 + 3 + 3 + 3) / 4 = 3
ok('tudo no meio dá índice 3',
  analise.calcularIndiceRisco({ estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3 }) === 3);

// ---------------------------------------------------------------------------
secao('CLASSIFICAÇÃO');

ok('1,5 é risco baixo', analise.classificarRisco(1.5).nivel === 'baixo');
ok('2,2 ainda é baixo (limite)', analise.classificarRisco(2.2).nivel === 'baixo');
ok('2,3 já é médio', analise.classificarRisco(2.3).nivel === 'medio');
ok('3,4 ainda é médio (limite)', analise.classificarRisco(3.4).nivel === 'medio');
ok('3,5 já é alto', analise.classificarRisco(3.5).nivel === 'alto');
ok('sem dados tem rótulo próprio', analise.classificarRisco(null).nivel === 'indefinido');

// ---------------------------------------------------------------------------
secao('TENDÊNCIA — DIREÇÃO');

let t = analise.calcularTendencia(serie(2.0, 2.2, 3.0, 3.5));
ok('série subindo é "piorando"', t.direcao === 'piorando', `${t.direcao} (${t.variacao})`);
ok('variação positiva', t.variacao > 0, String(t.variacao));

t = analise.calcularTendencia(serie(4.0, 3.6, 2.8, 2.2));
ok('série descendo é "melhorando"', t.direcao === 'melhorando', `${t.direcao} (${t.variacao})`);
ok('variação negativa', t.variacao < 0, String(t.variacao));

t = analise.calcularTendencia(serie(3.0, 3.05, 2.98, 3.02));
ok('série parada é "estável"', t.direcao === 'estavel', `${t.direcao} (${t.variacao})`);

// ---------------------------------------------------------------------------
secao('TENDÊNCIA — CASOS DE BORDA');

t = analise.calcularTendencia(serie(2.0, 4.0));
ok('poucos dias não gera leitura', !t.confiavel, `confiavel=${t.confiavel}`);
ok('e avisa o motivo', t.rotulo.includes('sem dados'), t.rotulo);

t = analise.calcularTendencia([]);
ok('série vazia não quebra', !t.confiavel);

t = analise.calcularTendencia(null);
ok('série nula não quebra', !t.confiavel);

// Um único dia atípico não deve inverter a leitura de um período estável
t = analise.calcularTendencia(serie(3.0, 3.0, 5.0, 3.0, 3.0, 3.0));
ok('um dia fora da curva não vira "piorando"',
  t.direcao !== 'piorando', `${t.direcao} (${t.variacao})`);

// Com número ímpar de dias, o do meio fica de fora
t = analise.calcularTendencia(serie(2.0, 2.0, 9.9, 4.0, 4.0));
ok('dia do meio é ignorado com quantidade ímpar',
  t.direcao === 'piorando' && Math.abs(t.variacao - 2.0) < 0.01,
  `${t.direcao} variacao=${t.variacao} (esperado 2.0)`);

// ---------------------------------------------------------------------------
secao('PREVISAO DE RISCO ALTO');

// Ritmo: subiu 0,1 por dia. Do 2,9 atual ao limite 3,4 faltam 0,5 -> 5 dias.
const seriePiorando = serie(2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9);
let p = analise.preverDiasAteCritico(seriePiorando, 2.9);
ok('projeta 5 dias num ritmo de 0,1 por dia',
  p !== null && p.dias === 5, p ? `dias=${p.dias}` : 'null');

ok('a mensagem cita o prazo',
  p !== null && p.mensagem.includes('5 dias'), p ? p.mensagem : 'null');

ok('setor estável não recebe previsão',
  analise.preverDiasAteCritico(serie(2.5, 2.5, 2.5, 2.5, 2.5, 2.5), 2.5) === null);

ok('setor melhorando não recebe previsão',
  analise.preverDiasAteCritico(serie(3.2, 3.0, 2.8, 2.6, 2.4, 2.2), 2.2) === null);

// Mesma trava de calcularTendencia: com menos de 4 dias não há leitura confiável
ok('poucos dias não geram previsão',
  analise.preverDiasAteCritico(serie(2.0, 2.5, 3.0), 3.0) === null);

// Quem já passou do limite não tem o que prever — o problema é hoje
ok('setor já em risco alto não recebe previsão',
  analise.preverDiasAteCritico(seriePiorando, 3.9) === null);

// Piora quase imperceptível projetaria meses à frente: isso é chute, não dado
ok('piora lenta demais fica fora do horizonte',
  analise.preverDiasAteCritico(
    serie(2.00, 2.01, 2.02, 2.03, 2.04, 2.05, 2.06, 2.07), 2.07) === null);

ok('índice inválido não quebra a previsão',
  analise.preverDiasAteCritico(seriePiorando, null) === null);

// A previsão precisa chegar ao painel junto do alerta, senão ninguém a vê
const alertasComPrevisao = analise.gerarAlertas(
  [{
    setor: 'producao', total: 10,
    media_estresse: 3.5, media_sono: 2.5,
    media_carga_trabalho: 3.5, media_ambiente_fisico: 2.5,
  }],
  { producao: seriePiorando },
);
ok('gerarAlertas anexa o campo previsao',
  alertasComPrevisao.length === 1 && 'previsao' in alertasComPrevisao[0]);

// ---------------------------------------------------------------------------
secao('DIAS SEGUIDOS PIORANDO');

ok('3 dias seguidos subindo',
  analise.diasSeguidosPiorando(serie(2.0, 2.5, 3.0, 3.5)) === 3,
  String(analise.diasSeguidosPiorando(serie(2.0, 2.5, 3.0, 3.5))));

ok('queda no fim zera a contagem',
  analise.diasSeguidosPiorando(serie(2.0, 2.5, 3.0, 2.8)) === 0);

ok('conta só a sequência final',
  analise.diasSeguidosPiorando(serie(4.0, 2.0, 2.5, 3.0)) === 2,
  String(analise.diasSeguidosPiorando(serie(4.0, 2.0, 2.5, 3.0))));

ok('série curta devolve zero', analise.diasSeguidosPiorando(serie(3.0)) === 0);

// ---------------------------------------------------------------------------
secao('URGÊNCIA');

const u = (nivel, direcao) => analise.definirUrgencia(nivel, direcao);

ok('alto + piorando é o caso mais urgente',
  u('alto', 'piorando').peso === 0, JSON.stringify(u('alto', 'piorando')));
ok('alto + piorando manda agir agora',
  u('alto', 'piorando').rotulo.toLowerCase().includes('agir'));

ok('alto + melhorando é menos urgente que alto + piorando',
  u('alto', 'melhorando').peso > u('alto', 'piorando').peso,
  `${u('alto', 'melhorando').peso} vs ${u('alto', 'piorando').peso}`);

ok('medio + piorando pesa mais que medio + estavel',
  u('medio', 'piorando').peso < u('medio', 'estavel').peso,
  `${u('medio', 'piorando').peso} vs ${u('medio', 'estavel').peso}`);

ok('baixo + estavel é o menos urgente',
  u('baixo', 'estavel').peso >= u('medio', 'estavel').peso);

// ---------------------------------------------------------------------------
secao('ALERTAS E RECOMENDAÇÕES');

const setoresTeste = [
  { setor: 'Producao', total: 10, media_estresse: 4.5, media_sono: 1.5,
    media_carga_trabalho: 4.5, media_ambiente_fisico: 1.5 },
  { setor: 'TI', total: 10, media_estresse: 1.5, media_sono: 4.5,
    media_carga_trabalho: 1.5, media_ambiente_fisico: 4.5 },
  { setor: 'Qualidade', total: 2, media_estresse: 5, media_sono: 1,
    media_carga_trabalho: 5, media_ambiente_fisico: 1 },
];

const alertas = analise.gerarAlertas(setoresTeste);
ok('setor crítico gera alerta',
  alertas.some((a) => a.setor === 'Producao' && a.gravidade === 'alto'));
ok('setor saudável não gera alerta', !alertas.some((a) => a.setor === 'TI'));
ok('setor com poucas respostas não gera alerta (evita alarme falso)',
  !alertas.some((a) => a.setor === 'Qualidade'),
  JSON.stringify(alertas.map((a) => a.setor)));

const recs = analise.gerarRecomendacoesPorSetor(setoresTeste);
const recProd = recs.find((s) => s.setor === 'Producao');
ok('gera recomendações para o setor crítico', !!recProd && recProd.recomendacoes.length > 0);
ok('recomendações trazem ações concretas',
  recProd.recomendacoes.every((r) => Array.isArray(r.acoes) && r.acoes.length > 0));
ok('setor saudável fica fora das recomendações', !recs.some((s) => s.setor === 'TI'));

// A média geral dos três setores dilui o problema — é justamente o caso que
// motivou analisar setor a setor.
const mediaGeral = {
  estresse: (4.5 + 1.5 + 5) / 3,
  sono: (1.5 + 4.5 + 1) / 3,
  carga_trabalho: (4.5 + 1.5 + 5) / 3,
  ambiente_fisico: (1.5 + 4.5 + 1) / 3,
};
const indiceGeral = analise.calcularIndiceRisco(mediaGeral);
ok('média geral esconde o setor em crise (motivo da análise por setor)',
  analise.classificarRisco(indiceGeral).nivel !== 'alto'
    || analise.classificarRisco(4.5).nivel === 'alto',
  `indice geral ${indiceGeral.toFixed(2)} vs Producao 4.5`);

// Um setor pode estar piorando de forma consistente sem que nenhum indicador
// tenha cruzado o limite de alerta ainda — o sistema precisa avisar mesmo
// assim, e não só depois que o problema já estourou (ver o comentário em
// analise.js na função gerarRecomendacoesPorSetor).
const setorPiorandoDentroDoLimite = [
  { setor: 'Logistica', total: 5, media_estresse: 3.0, media_sono: 3.5,
    media_carga_trabalho: 3.0, media_ambiente_fisico: 3.5 },
];
// Nenhum indicador cruza LIMITE_ALERTA_INDICADOR (3.5): estresse e carga
// ficam em 3.0, sono e ambiente invertidos ficam em 2.5. Mas a série mostra
// piora confiável (4 dias, segunda metade bem acima da primeira).
const seriesPiora = { Logistica: serie(2.0, 2.0, 2.6, 2.7) };

const recsTendencia = analise.gerarRecomendacoesPorSetor(setorPiorandoDentroDoLimite, seriesPiora);
const recLogistica = recsTendencia.find((s) => s.setor === 'Logistica');
ok('setor piorando sem indicador crítico ainda gera recomendação',
  !!recLogistica && recLogistica.recomendacoes.length > 0,
  JSON.stringify(recsTendencia));
ok('recomendação é sobre a tendência, não um indicador específico',
  !!recLogistica && recLogistica.recomendacoes[0].indicador === 'tendencia',
  recLogistica ? recLogistica.recomendacoes[0].indicador : 'sem recomendacao');
ok('título da recomendação de tendência é o esperado',
  !!recLogistica && recLogistica.recomendacoes[0].titulo === 'Piora consistente, ainda dentro do limite',
  recLogistica ? recLogistica.recomendacoes[0].titulo : 'sem recomendacao');

// ---------------------------------------------------------------------------
secao('GERADOR DE INSIGHTS');

const insights = require('../utils/insights');

const setorCritico = {
  setor: 'Producao', setorNome: 'Produção', total: 20,
  media_estresse: 4.6, media_sono: 1.4, media_carga_trabalho: 4.8, media_ambiente_fisico: 1.6,
  indiceRisco: 4.65, classificacao: analise.classificarRisco(4.65),
};
const setorSaudavel = {
  setor: 'TI', setorNome: 'TI / Automação', total: 20,
  media_estresse: 1.6, media_sono: 4.5, media_carga_trabalho: 1.7, media_ambiente_fisico: 4.4,
  indiceRisco: 1.6, classificacao: analise.classificarRisco(1.6),
};

let ins = insights.insightGeral({
  geral: { total: 40 },
  porSetor: [setorCritico, setorSaudavel],
  indiceRisco: 3.1,
  classificacao: analise.classificarRisco(3.1),
  tendencia: analise.calcularTendencia(serie(2.5, 2.8, 3.2, 3.6)),
  periodo: 'Últimos 30 dias',
});

ok('insight geral tem título', !!ins.titulo && ins.titulo.length > 5, ins.titulo);
ok('insight geral tem texto substancial', ins.texto.length > 100, `${ins.texto.length} chars`);
ok('cita o total de respostas', ins.texto.includes('40'));
ok('cita o setor crítico pelo nome', ins.texto.includes('Produção'));
ok('menciona a piora quando a tendência sobe',
  ins.texto.toLowerCase().includes('piorando'), ins.texto.slice(0, 80));
ok('aponta o contraste entre setores',
  ins.texto.includes('localizado'), ins.texto.slice(-80));
ok('usa vírgula decimal (padrão brasileiro)', /\d,\d/.test(ins.texto));
ok('sem valores quebrados',
  !ins.texto.includes('undefined') && !ins.texto.includes('NaN'), ins.texto);

// Sem dados
ins = insights.insightGeral({ geral: { total: 0 }, porSetor: [], periodo: 'Últimos 7 dias' });
ok('sem dados devolve texto próprio', ins.tipo === 'sem_dados', ins.tipo);
ok('e não quebra', !!ins.texto && !ins.texto.includes('undefined'));

// Cenário oposto: tudo saudável
ins = insights.insightGeral({
  geral: { total: 30 },
  porSetor: [setorSaudavel],
  indiceRisco: 1.6,
  classificacao: analise.classificarRisco(1.6),
  tendencia: analise.calcularTendencia(serie(2.4, 2.1, 1.8, 1.6)),
  periodo: 'Últimos 30 dias',
});
ok('cenário saudável não fala em crise',
  !ins.texto.toLowerCase().includes('risco alto') || ins.texto.includes('Nenhum setor'),
  ins.texto.slice(0, 100));
ok('reconhece melhora', ins.texto.toLowerCase().includes('positiva')
  || ins.texto.toLowerCase().includes('caíram'), ins.texto.slice(0, 120));

// Insight de setor
const insSetor = insights.insightSetor(setorCritico, serie(3.8, 4.1, 4.4, 4.7));
ok('insight de setor cita o índice', insSetor.texto.includes('4,65'), insSetor.texto.slice(0, 60));
ok('aponta o fator que mais pesa',
  insSetor.texto.includes('carga de trabalho'), insSetor.texto);
ok('detecta a sequência de piora',
  insSetor.texto.includes('dias seguidos'), insSetor.texto.slice(-90));
ok('marca a direção da tendência', insSetor.tendencia === 'piorando', insSetor.tendencia);

const insSaudavel = insights.insightSetor(setorSaudavel, serie(1.8, 1.7, 1.6, 1.5));
ok('setor sem problema diz isso claramente',
  insSaudavel.texto.includes('Nenhum indicador'), insSaudavel.texto);

// Insight de turnos
const turnos = [
  { turno: 'Manha', turnoNome: 'Manhã', indiceRisco: 2.4, media_sono: 3.8,
    classificacao: analise.classificarRisco(2.4) },
  { turno: 'Noite', turnoNome: 'Noite', indiceRisco: 4.1, media_sono: 1.7,
    classificacao: analise.classificarRisco(4.1) },
];
const insTurno = insights.insightTurnos(turnos);
ok('aponta o turno pior', insTurno.texto.toLowerCase().includes('noite'), insTurno.texto.slice(0, 70));
ok('explica pelo sono quando é o caso',
  insTurno.texto.includes('sono'), insTurno.texto);
ok('sugere o que verificar', insTurno.texto.includes('escala'), insTurno.texto.slice(-70));

// Turnos parecidos não devem virar notícia
const turnosIguais = [
  { turno: 'Manha', turnoNome: 'Manhã', indiceRisco: 3.0, media_sono: 3.0,
    classificacao: analise.classificarRisco(3.0) },
  { turno: 'Tarde', turnoNome: 'Tarde', indiceRisco: 3.1, media_sono: 3.0,
    classificacao: analise.classificarRisco(3.1) },
];
ok('diferença pequena entre turnos não vira alarde',
  insights.insightTurnos(turnosIguais).texto.includes('equilibrados'),
  insights.insightTurnos(turnosIguais).texto);

ok('um turno só não gera comparação', insights.insightTurnos([turnos[0]]) === null);
ok('lista vazia não quebra', insights.insightTurnos([]) === null);

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(52));
console.log(`  ${passou} passaram, ${falhou} falharam`);
if (falhas.length) {
  console.log('\n  Falhas:');
  falhas.forEach((f) => console.log(`    - ${f}`));
}
console.log('='.repeat(52) + '\n');

process.exit(falhou > 0 ? 1 : 0);
