// Lógica de dados e análise do RiscoZero, portada de utils/analise.js e
// utils/insights.js do projeto original, para alimentar o protótipo com
// números e textos coerentes com o sistema real.

export function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const NOMES_SETORES = {
  Producao: 'Produção', Manutencao: 'Manutenção', Qualidade: 'Qualidade',
  Logistica: 'Logística', TI: 'TI / Automação', Administrativo: 'Administrativo',
};
export const NOMES_TURNOS = { Manha: 'Manhã', Tarde: 'Tarde', Noite: 'Noite' };
export const NOMES_INDICADORES = {
  estresse: 'Estresse', sono: 'Qualidade do sono',
  carga_trabalho: 'Carga de trabalho', ambiente_fisico: 'Ambiente físico',
};
export const NOMES_INDICADORES_ARTIGO = {
  estresse: 'o nível de estresse', sono: 'a qualidade do sono',
  carga_trabalho: 'a carga de trabalho', ambiente_fisico: 'o conforto do ambiente',
};
const INDICADORES_INVERTIDOS = ['sono', 'ambiente_fisico'];
const LIMITES_RISCO = { BAIXO_ATE: 2.2, MEDIO_ATE: 3.4 };
const LIMITE_ALERTA_INDICADOR = 3.5;
const MINIMO_RESPOSTAS_ALERTA = 3;
const VARIACAO_MINIMA = 0.25;
const DIAS_MINIMOS_TENDENCIA = 4;

const PERFIS = {
  Producao: { estresse: { base: 4.2, variacao: 0.8 }, sono: { base: 2.0, variacao: 0.8 }, carga_trabalho: { base: 4.3, variacao: 0.7 }, ambiente_fisico: { base: 2.2, variacao: 0.8 } },
  Manutencao: { estresse: { base: 3.6, variacao: 0.9 }, sono: { base: 2.6, variacao: 0.9 }, carga_trabalho: { base: 3.9, variacao: 0.8 }, ambiente_fisico: { base: 3.0, variacao: 0.9 } },
  Qualidade: { estresse: { base: 2.6, variacao: 0.9 }, sono: { base: 3.5, variacao: 0.9 }, carga_trabalho: { base: 2.8, variacao: 0.9 }, ambiente_fisico: { base: 3.8, variacao: 0.8 } },
  TI: { estresse: { base: 2.2, variacao: 0.8 }, sono: { base: 4.0, variacao: 0.8 }, carga_trabalho: { base: 2.5, variacao: 0.9 }, ambiente_fisico: { base: 4.2, variacao: 0.7 } },
  Logistica: { estresse: { base: 3.2, variacao: 1.0 }, sono: { base: 2.9, variacao: 0.9 }, carga_trabalho: { base: 3.4, variacao: 0.9 }, ambiente_fisico: { base: 3.1, variacao: 0.9 } },
  Administrativo: { estresse: { base: 2.8, variacao: 0.9 }, sono: { base: 3.4, variacao: 0.9 }, carga_trabalho: { base: 2.9, variacao: 0.9 }, ambiente_fisico: { base: 4.0, variacao: 0.8 } },
};
const COMENTARIOS = {
  Producao: ['O ruído da linha nova está muito alto, saio com dor de cabeça.', 'Três dias seguidos de meta puxada, não estou dando conta.', 'Faltou gente no turno de novo, sobrou tudo pra gente.', 'Preciso de pausa, não consigo nem ir no banheiro direito.'],
  Manutencao: ['Muito chamado urgente ao mesmo tempo, fica difícil priorizar.', 'Equipamento novo quebra direto e a cobrança vem pra cima da gente.'],
  Qualidade: ['Semana tranquila, deu pra organizar as inspeções.', 'Sistema novo ajudou a reduzir retrabalho.'],
  TI: ['Boa semana, conseguimos automatizar parte dos relatórios.', 'Sem sobrecarga, dá pra manter o ritmo.'],
  Logistica: ['Pico de expedição essa semana pesou bastante.', 'Empilhadeira parada atrasou tudo, gerou correria.'],
  Administrativo: ['Fechamento do mês sempre aperta um pouco.', 'Ambiente confortável, sem reclamações.'],
};
const EFEITO_TURNO = {
  Manha: { estresse: 0, sono: 0.3, carga_trabalho: 0, ambiente_fisico: 0.2 },
  Tarde: { estresse: 0.2, sono: 0, carga_trabalho: 0.2, ambiente_fisico: 0 },
  Noite: { estresse: 0.4, sono: -1.1, carga_trabalho: 0.5, ambiente_fisico: -0.3 },
};
const SETOR_EM_PIORA = 'Producao';
const DIAS = 30;

function sortearNota(rnd, perfil, ajuste = 0) {
  const sorteio = (rnd() + rnd()) / 2;
  const desvio = (sorteio - 0.5) * 2 * perfil.variacao;
  return Math.min(5, Math.max(1, Math.round(perfil.base + ajuste + desvio)));
}
function sortearTurno(rnd) {
  const s = rnd();
  if (s < 0.42) return 'Manha';
  if (s < 0.80) return 'Tarde';
  return 'Noite';
}
function agravamento(diasAtras, totalDias) {
  const proximidade = (totalDias - 1 - diasAtras) / (totalDias - 1);
  return proximidade * 1.2;
}

export function gerarDados(seed = 42) {
  const rnd = mulberry32(seed);
  const setores = Object.keys(PERFIS);
  const registros = [];
  for (let dia = DIAS - 1; dia >= 0; dia--) {
    const data = new Date();
    data.setDate(data.getDate() - dia);
    const diaSemana = data.getDay();
    const fimDeSemana = diaSemana === 0 || diaSemana === 6;
    const quantidade = fimDeSemana ? Math.floor(rnd() * 3) : 6 + Math.floor(rnd() * 7);
    for (let i = 0; i < quantidade; i++) {
      const setor = setores[Math.floor(rnd() * setores.length)];
      const perfil = PERFIS[setor];
      const turno = sortearTurno(rnd);
      const efeito = EFEITO_TURNO[turno];
      const piora = setor === SETOR_EM_PIORA ? agravamento(dia, DIAS) : 0;
      const comTurno = (ind) => {
        const invertido = ind === 'sono' || ind === 'ambiente_fisico';
        return { base: perfil[ind].base + efeito[ind] + (invertido ? -piora : piora), variacao: perfil[ind].variacao };
      };
      const lista = COMENTARIOS[setor] || [];
      const comentario = rnd() < 0.22 && lista.length > 0 ? lista[Math.floor(rnd() * lista.length)] : null;
      registros.push({
        setor, turno,
        estresse: sortearNota(rnd, comTurno('estresse')),
        sono: sortearNota(rnd, comTurno('sono')),
        carga_trabalho: sortearNota(rnd, comTurno('carga_trabalho')),
        ambiente_fisico: sortearNota(rnd, comTurno('ambiente_fisico')),
        comentario, dia_index: dia, data,
      });
    }
  }
  return registros;
}

export function paraNotaDeRisco(indicador, nota) {
  if (nota === null || nota === undefined) return null;
  return INDICADORES_INVERTIDOS.includes(indicador) ? 6 - nota : nota;
}
export function calcularIndiceRisco(medias) {
  const chaves = ['estresse', 'sono', 'carga_trabalho', 'ambiente_fisico'];
  const notas = chaves.map((c) => paraNotaDeRisco(c, medias[c]));
  if (notas.some((n) => n === null || Number.isNaN(n))) return null;
  return notas.reduce((s, n) => s + n, 0) / notas.length;
}
export function classificarRisco(indice) {
  if (indice === null || indice === undefined || Number.isNaN(indice)) return { nivel: 'indefinido', rotulo: 'Sem dados' };
  if (indice <= LIMITES_RISCO.BAIXO_ATE) return { nivel: 'baixo', rotulo: 'Baixo' };
  if (indice <= LIMITES_RISCO.MEDIO_ATE) return { nivel: 'medio', rotulo: 'Médio' };
  return { nivel: 'alto', rotulo: 'Alto' };
}
export function indicadoresCriticos(medias) {
  return Object.keys(NOMES_INDICADORES)
    .map((chave) => ({ chave, nome: NOMES_INDICADORES[chave], mediaBruta: medias[chave], notaDeRisco: paraNotaDeRisco(chave, medias[chave]) }))
    .filter((i) => i.notaDeRisco !== null && i.notaDeRisco >= LIMITE_ALERTA_INDICADOR)
    .sort((a, b) => b.notaDeRisco - a.notaDeRisco);
}
export function calcularTendencia(serie) {
  const semDados = { direcao: 'indefinida', variacao: 0, confiavel: false };
  if (!Array.isArray(serie) || serie.length < DIAS_MINIMOS_TENDENCIA) return semDados;
  const valores = serie.map((p) => p.indiceRisco).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (valores.length < DIAS_MINIMOS_TENDENCIA) return semDados;
  const meio = Math.floor(valores.length / 2);
  const media = (l) => l.reduce((s, v) => s + v, 0) / l.length;
  const antes = media(valores.slice(0, meio));
  const depois = media(valores.slice(valores.length - meio));
  const variacao = depois - antes;
  let direcao;
  if (Math.abs(variacao) < VARIACAO_MINIMA) direcao = 'estavel';
  else if (variacao > 0) direcao = 'piorando';
  else direcao = 'melhorando';
  return { direcao, variacao: Number(variacao.toFixed(2)), confiavel: true, diasAnalisados: valores.length };
}
export function diasSeguidosPiorando(serie) {
  if (!Array.isArray(serie) || serie.length < 2) return 0;
  let dias = 0;
  for (let i = serie.length - 1; i > 0; i--) {
    if (serie[i].indiceRisco > serie[i - 1].indiceRisco) dias++; else break;
  }
  return dias;
}
export function definirUrgencia(nivel, direcao) {
  if (nivel === 'alto' && direcao === 'piorando') return { peso: 0, rotulo: 'Agir agora', descricao: 'Risco alto e piorando.' };
  if (nivel === 'alto') return { peso: 1, rotulo: 'Prioridade', descricao: 'Risco alto.' };
  if (nivel === 'medio' && direcao === 'piorando') return { peso: 2, rotulo: 'Atenção', descricao: 'Risco médio e subindo.' };
  if (nivel === 'medio') return { peso: 3, rotulo: 'Acompanhar', descricao: 'Risco médio.' };
  if (direcao === 'piorando') return { peso: 4, rotulo: 'De olho', descricao: 'Risco baixo, mas subindo.' };
  return { peso: 5, rotulo: 'Estável', descricao: 'Sem sinal de agravamento.' };
}

const RECOMENDACOES = {
  estresse: { titulo: 'Estresse elevado na equipe', acoes: ['Revisar metas e prazos do período — verificar se há acúmulo de cobranças simultâneas.', 'Garantir que as pausas previstas estejam realmente sendo respeitadas no turno.', 'Abrir um canal de escuta com a equipe antes que o quadro vire afastamento.'] },
  sono: { titulo: 'Qualidade de sono baixa', acoes: ['Avaliar a escala de turnos — trocas frequentes de horário prejudicam o descanso.', 'Verificar excesso de horas extras ou jornadas encadeadas.', 'Considerar orientação sobre higiene do sono junto à equipe de saúde ocupacional.'] },
  carga_trabalho: { titulo: 'Carga de trabalho acima do sustentável', acoes: ['Redistribuir tarefas entre os turnos ou setores com menor demanda.', 'Checar se a automação recente transferiu tarefas de supervisão sem reduzir as antigas.', 'Avaliar necessidade de reforço temporário na equipe.'] },
  ambiente_fisico: { titulo: 'Ambiente físico desconfortável', acoes: ['Medir ruído, temperatura e iluminação nos postos apontados.', 'Revisar ergonomia das estações de trabalho e postos de operação.', 'Verificar se equipamentos novos alteraram o layout sem readequação do posto.'] },
};

function filtrarPeriodo(respostas, dias) {
  if (dias === 'tudo') return respostas;
  return respostas.filter((r) => r.dia_index < dias);
}
function agregarPorChave(respostas, chaveFn) {
  const grupos = {};
  respostas.forEach((r) => {
    const k = chaveFn(r);
    if (!grupos[k]) grupos[k] = { total: 0, soma_estresse: 0, soma_sono: 0, soma_carga_trabalho: 0, soma_ambiente_fisico: 0 };
    const g = grupos[k];
    g.total++; g.soma_estresse += r.estresse; g.soma_sono += r.sono;
    g.soma_carga_trabalho += r.carga_trabalho; g.soma_ambiente_fisico += r.ambiente_fisico;
  });
  return Object.entries(grupos).map(([chave, g]) => ({
    chave, total: g.total,
    media_estresse: g.soma_estresse / g.total, media_sono: g.soma_sono / g.total,
    media_carga_trabalho: g.soma_carga_trabalho / g.total, media_ambiente_fisico: g.soma_ambiente_fisico / g.total,
  }));
}
function serieDiaria(respostas, totalDias) {
  const porDia = {};
  respostas.forEach((r) => {
    if (!porDia[r.dia_index]) porDia[r.dia_index] = [];
    porDia[r.dia_index].push(r);
  });
  const serie = [];
  for (let dia = totalDias - 1; dia >= 0; dia--) {
    const lista = porDia[dia];
    if (!lista || lista.length === 0) continue;
    const medias = {
      estresse: lista.reduce((s, r) => s + r.estresse, 0) / lista.length,
      sono: lista.reduce((s, r) => s + r.sono, 0) / lista.length,
      carga_trabalho: lista.reduce((s, r) => s + r.carga_trabalho, 0) / lista.length,
      ambiente_fisico: lista.reduce((s, r) => s + r.ambiente_fisico, 0) / lista.length,
    };
    serie.push({ dia_index: dia, indiceRisco: calcularIndiceRisco(medias), total: lista.length });
  }
  return serie;
}

function num(v, casas = 1) { return Number(v).toFixed(casas).replace('.', ','); }
function listar(itens) {
  if (itens.length === 0) return '';
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** Monta o modelo completo do dashboard para um período (7 | 30 | 'tudo'). */
export function computarPainel(todasRespostas, periodo) {
  const totalDiasBase = 30;
  const dias = periodo === 'tudo' ? totalDiasBase : Number(periodo);
  const respostas = filtrarPeriodo(todasRespostas, dias);

  const geralArr = agregarPorChave(respostas, () => 'geral');
  const geral = geralArr[0] || { total: 0 };
  const mediasGerais = geral.total ? {
    estresse: geral.media_estresse, sono: geral.media_sono,
    carga_trabalho: geral.media_carga_trabalho, ambiente_fisico: geral.media_ambiente_fisico,
  } : null;
  const indiceGeral = mediasGerais ? calcularIndiceRisco(mediasGerais) : null;
  const classificacaoGeral = classificarRisco(indiceGeral);
  const serieGeral = serieDiaria(respostas, dias);
  const tendenciaGeral = calcularTendencia(serieGeral);

  const porSetorBase = agregarPorChave(respostas, (r) => r.setor);
  const seriesPorSetor = {};
  Object.keys(PERFIS).forEach((s) => { seriesPorSetor[s] = serieDiaria(respostas.filter((r) => r.setor === s), dias); });

  const porSetor = porSetorBase.map((s) => {
    const medias = { estresse: s.media_estresse, sono: s.media_sono, carga_trabalho: s.media_carga_trabalho, ambiente_fisico: s.media_ambiente_fisico };
    const indice = calcularIndiceRisco(medias);
    const classificacao = classificarRisco(indice);
    const serie = seriesPorSetor[s.chave] || [];
    const tendencia = calcularTendencia(serie);
    return { setor: s.chave, setorNome: NOMES_SETORES[s.chave] || s.chave, total: s.total, indiceRisco: Number(indice.toFixed(2)), classificacao, tendencia, medias };
  }).sort((a, b) => b.indiceRisco - a.indiceRisco);

  const porTurnoBase = agregarPorChave(respostas, (r) => r.turno);
  const porTurno = porTurnoBase.map((t) => {
    const medias = { estresse: t.media_estresse, sono: t.media_sono, carga_trabalho: t.media_carga_trabalho, ambiente_fisico: t.media_ambiente_fisico };
    const indice = calcularIndiceRisco(medias);
    return { turno: t.chave, turnoNome: NOMES_TURNOS[t.chave] || t.chave, total: t.total, indiceRisco: Number(indice.toFixed(2)), classificacao: classificarRisco(indice), media_sono: t.media_sono };
  }).sort((a, b) => {
    const ordem = { Manha: 0, Tarde: 1, Noite: 2 };
    return ordem[a.turno] - ordem[b.turno];
  });

  // Alertas
  const alertas = [];
  porSetor.forEach((s) => {
    if (s.total < MINIMO_RESPOSTAS_ALERTA) return;
    const serie = seriesPorSetor[s.setor] || [];
    const tendencia = calcularTendencia(serie);
    const diasPiorando = diasSeguidosPiorando(serie);
    let complemento = '';
    if (tendencia.confiavel && tendencia.direcao === 'piorando') complemento = diasPiorando >= 2 ? ` E vem piorando há ${diasPiorando} dias.` : ' E a tendência é de piora.';
    else if (tendencia.confiavel && tendencia.direcao === 'melhorando') complemento = ' A tendência é de melhora.';
    if (s.classificacao.nivel === 'alto') {
      const criticos = indicadoresCriticos(s.medias);
      const principal = criticos.length > 0 ? criticos[0].nome : 'indicadores gerais';
      alertas.push({ gravidade: 'alto', setorNome: s.setorNome, mensagem: `${s.setorNome} está em risco alto. Fator principal: ${principal.toLowerCase()}.${complemento}` });
    } else if (s.classificacao.nivel === 'medio') {
      alertas.push({ gravidade: 'medio', setorNome: s.setorNome, mensagem: `${s.setorNome} está em risco médio.${complemento || ' Vale acompanhar de perto.'}` });
    } else if (tendencia.confiavel && tendencia.direcao === 'piorando' && diasPiorando >= 3) {
      alertas.push({ gravidade: 'medio', setorNome: s.setorNome, mensagem: `${s.setorNome} ainda está em risco baixo, mas vem piorando há ${diasPiorando} dias.` });
    }
  });
  const ordemGrav = { alto: 0, medio: 1 };
  alertas.sort((a, b) => ordemGrav[a.gravidade] - ordemGrav[b.gravidade]);

  // Recomendações por setor
  const recomendacoesPorSetor = porSetor
    .filter((s) => s.total >= MINIMO_RESPOSTAS_ALERTA)
    .map((s) => {
      const criticos = indicadoresCriticos(s.medias);
      const serie = seriesPorSetor[s.setor] || [];
      const tendencia = calcularTendencia(serie);
      const diasPiorando = diasSeguidosPiorando(serie);
      let blocos = criticos.map((c) => ({ indicador: c.chave, titulo: RECOMENDACOES[c.chave].titulo, acoes: RECOMENDACOES[c.chave].acoes, mediaBruta: Number(c.mediaBruta.toFixed(2)) }));
      if (blocos.length === 0 && tendencia.confiavel && tendencia.direcao === 'piorando') {
        const pior = Object.keys(NOMES_INDICADORES).map((chave) => ({ chave, nota: paraNotaDeRisco(chave, s.medias[chave]) })).sort((a, b) => b.nota - a.nota)[0];
        blocos.push({ indicador: 'tendencia', titulo: 'Piora consistente, ainda dentro do limite', acoes: [`Os indicadores subiram ${Math.abs(tendencia.variacao).toFixed(2)} ponto(s) ao longo dos últimos ${tendencia.diasAnalisados} dias.`, `O que mais pesa hoje é ${NOMES_INDICADORES[pior.chave].toLowerCase()}.`, 'Ainda dá para agir antes de o quadro chegar ao nível de alerta.'], mediaBruta: null });
      }
      return { setor: s.setor, setorNome: s.setorNome, total: s.total, indiceRisco: s.indiceRisco, classificacao: s.classificacao, tendencia, diasPiorando, urgencia: definirUrgencia(s.classificacao.nivel, tendencia.direcao), recomendacoes: blocos };
    })
    .filter((s) => s.recomendacoes.length > 0)
    .sort((a, b) => a.urgencia.peso - b.urgencia.peso || b.indiceRisco - a.indiceRisco);

  // Insight geral
  let insightGeral;
  if (!geral.total) {
    insightGeral = { titulo: 'Ainda não há dados suficientes', texto: 'Assim que a equipe começar a responder, a leitura aparece aqui.' };
  } else {
    const partes = [];
    partes.push(`Com ${geral.total} respostas no período, o risco psicossocial geral está em ${num(indiceGeral, 2)} de 5,0 — nível ${classificacaoGeral.rotulo.toLowerCase()}.`);
    if (tendenciaGeral.confiavel) {
      if (tendenciaGeral.direcao === 'piorando') partes.push(`O quadro vem piorando: os indicadores subiram ${num(Math.abs(tendenciaGeral.variacao), 2)} ponto(s) ao longo do período.`);
      else if (tendenciaGeral.direcao === 'melhorando') partes.push(`A tendência é positiva: os indicadores caíram ${num(Math.abs(tendenciaGeral.variacao), 2)} ponto(s) no período.`);
      else partes.push('O quadro está estável, sem variação relevante no período.');
    }
    const criticosS = porSetor.filter((s) => s.classificacao.nivel === 'alto');
    const saudaveis = porSetor.filter((s) => s.classificacao.nivel === 'baixo');
    if (criticosS.length > 0) partes.push(`${criticosS.length === 1 ? 'O setor' : 'Os setores'} ${listar(criticosS.map((s) => s.setorNome))} ${criticosS.length === 1 ? 'está' : 'estão'} em risco alto e ${criticosS.length === 1 ? 'precisa' : 'precisam'} de atenção.`);
    else partes.push('Nenhum setor está em risco alto no momento.');
    if (criticosS.length > 0 && saudaveis.length > 0) {
      const pior = criticosS.reduce((m, s) => (s.indiceRisco > m.indiceRisco ? s : m));
      const melhor = saudaveis.reduce((m, s) => (s.indiceRisco < m.indiceRisco ? s : m));
      partes.push(`A diferença entre setores é grande: ${pior.setorNome} está em ${num(pior.indiceRisco, 2)} enquanto ${melhor.setorNome} está em ${num(melhor.indiceRisco, 2)} — o que indica um problema localizado, não geral.`);
    }
    let titulo;
    const piorando = tendenciaGeral.confiavel && tendenciaGeral.direcao === 'piorando';
    const melhorando = tendenciaGeral.confiavel && tendenciaGeral.direcao === 'melhorando';
    if (classificacaoGeral.nivel === 'alto') titulo = piorando ? 'Situação crítica e se agravando' : 'Situação crítica';
    else if (classificacaoGeral.nivel === 'medio') titulo = piorando ? 'Atenção: o quadro vem piorando' : melhorando ? 'Quadro moderado, mas melhorando' : 'Quadro moderado e estável';
    else titulo = melhorando ? 'Situação boa e melhorando' : 'Situação sob controle';
    insightGeral = { titulo, texto: partes.join(' ') };
  }

  // Insights por setor
  const insightsSetor = porSetor.filter((s) => s.total >= MINIMO_RESPOSTAS_ALERTA).map((s) => {
    const criticos = indicadoresCriticos(s.medias);
    const partes = [`${s.setorNome} está com índice ${num(s.indiceRisco, 2)} de 5,0 (${s.classificacao.rotulo.toLowerCase()}), com base em ${s.total} respostas.`];
    if (criticos.length === 0) partes.push('Nenhum indicador isolado passou do limite de atenção.');
    else {
      partes.push(`O fator que mais pesa é ${NOMES_INDICADORES_ARTIGO[criticos[0].chave]}, com média ${num(criticos[0].mediaBruta)} de 5,0.`);
      if (criticos.length > 1) partes.push(`Também estão acima do limite: ${listar(criticos.slice(1).map((c) => NOMES_INDICADORES[c.chave]))}.`);
    }
    if (s.tendencia.confiavel) {
      if (s.tendencia.direcao === 'piorando') {
        const d = diasSeguidosPiorando(seriesPorSetor[s.setor] || []);
        partes.push(d >= 2 ? `O índice sobe há ${d} dias seguidos — é o momento de agir.` : 'O índice vem subindo no período.');
      } else if (s.tendencia.direcao === 'melhorando') partes.push('O índice vem caindo, o que sugere que algo recente está ajudando.');
    }
    return { setor: s.setor, setorNome: s.setorNome, nivel: s.classificacao.nivel, texto: partes.join(' ') };
  });

  // Comentários (com proteção de anonimato: setor precisa de >= 3 respostas no período)
  const setoresProtegidos = new Set(porSetor.filter((s) => s.total < MINIMO_RESPOSTAS_ALERTA).map((s) => s.setor));
  const todosComentarios = respostas.filter((r) => r.comentario).sort((a, b) => a.dia_index - b.dia_index);
  const comentariosOcultos = todosComentarios.filter((c) => setoresProtegidos.has(c.setor)).length;
  const comentarios = todosComentarios.filter((c) => !setoresProtegidos.has(c.setor)).map((c) => {
    const setorInfo = porSetor.find((s) => s.setor === c.setor);
    return { ...c, setorNome: NOMES_SETORES[c.setor] || c.setor, nivel: setorInfo ? setorInfo.classificacao.nivel : 'indefinido' };
  }).reverse();

  return {
    geral: { total: geral.total || 0, indice: indiceGeral, classificacao: classificacaoGeral, tendencia: tendenciaGeral, medias: mediasGerais },
    serieGeral, porSetor, porTurno, alertas, recomendacoesPorSetor, insightGeral, insightsSetor,
    comentarios, comentariosOcultos, cardIndicadores: mediasGerais,
  };
}
