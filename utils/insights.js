// utils/insights.js
// Gerador automático de insights.
//
// O QUE É: transforma os números do painel em frases em português. Em vez de
// a pessoa olhar "Produção: índice 4,2, tendência piorando, estresse 4,6" e
// precisar interpretar sozinha, o sistema escreve o que aquilo significa.
//
// O QUE NÃO É: isto não é inteligência artificial. São regras explícitas
// (if/else) escolhendo entre textos prontos e preenchendo os números. Foi uma
// decisão consciente, pelo mesmo motivo que as recomendações também são por
// regra: em decisão sobre saúde do trabalhador, o gestor precisa poder abrir o
// código e ver exatamente por que o sistema disse aquilo. Um modelo de
// linguagem escreveria frases mais variadas, mas ninguém conseguiria auditar
// o critério — e aqui isso importa mais do que soar natural.
//
// Ao apresentar, chame de "gerador automático de insights", não de IA.

const analise = require('./analise');

const NOMES_INDICADORES = {
  estresse: 'o nível de estresse',
  sono: 'a qualidade do sono',
  carga_trabalho: 'a carga de trabalho',
  ambiente_fisico: 'o conforto do ambiente',
};

// Como cada indicador se comporta quando está ruim. Serve para escrever a
// frase na direção certa: sono "caiu", estresse "subiu".
const VERBO_PIORA = {
  estresse: 'subiu',
  carga_trabalho: 'aumentou',
  sono: 'caiu',
  ambiente_fisico: 'piorou',
};

/** Junta itens numa lista em português: "a, b e c". */
function listar(itens) {
  if (itens.length === 0) return '';
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** Número com vírgula decimal, como se escreve em português. */
function num(valor, casas = 1) {
  return Number(valor).toFixed(casas).replace('.', ',');
}

/**
 * Escreve o insight geral do período — a leitura de conjunto, antes de entrar
 * setor a setor.
 */
function insightGeral({ geral, porSetor, indiceRisco, classificacao, tendencia, periodo }) {
  if (!geral || geral.total === 0) {
    return {
      tipo: 'sem_dados',
      titulo: 'Ainda não há dados suficientes',
      texto: 'Assim que a equipe começar a responder, a leitura aparece aqui.',
    };
  }

  const partes = [];

  partes.push(
    `Com ${geral.total} resposta${geral.total > 1 ? 's' : ''} no período (${periodo.toLowerCase()}), `
    + `o risco psicossocial geral está em ${num(indiceRisco, 2)} de 5,0 — nível `
    + `${classificacao.rotulo.toLowerCase()}.`
  );

  // A direção pesa mais que o valor absoluto: um índice médio subindo merece
  // mais atenção que um índice alto que vem caindo.
  if (tendencia && tendencia.confiavel) {
    if (tendencia.direcao === 'piorando') {
      partes.push(
        `O quadro vem piorando: os indicadores subiram ${num(Math.abs(tendencia.variacao), 2)} `
        + `ponto${Math.abs(tendencia.variacao) >= 2 ? 's' : ''} ao longo do período.`
      );
    } else if (tendencia.direcao === 'melhorando') {
      partes.push(
        `A tendência é positiva: os indicadores caíram ${num(Math.abs(tendencia.variacao), 2)} `
        + `ponto${Math.abs(tendencia.variacao) >= 2 ? 's' : ''} no período.`
      );
    } else {
      partes.push('O quadro está estável, sem variação relevante no período.');
    }
  }

  const criticos = porSetor.filter((s) => s.classificacao.nivel === 'alto');
  const saudaveis = porSetor.filter((s) => s.classificacao.nivel === 'baixo');

  if (criticos.length > 0) {
    const nomes = listar(criticos.map((s) => s.setorNome || s.setor));
    partes.push(
      `${criticos.length === 1 ? 'O setor' : 'Os setores'} ${nomes} `
      + `${criticos.length === 1 ? 'está' : 'estão'} em risco alto e ${criticos.length === 1 ? 'precisa' : 'precisam'} de atenção.`
    );
  } else {
    partes.push('Nenhum setor está em risco alto no momento.');
  }

  // Contraste entre setores é a informação mais acionável: mostra que o
  // problema é local, não da empresa inteira — e portanto tem solução local.
  if (criticos.length > 0 && saudaveis.length > 0) {
    const pior = criticos.reduce((m, s) => (s.indiceRisco > m.indiceRisco ? s : m));
    const melhor = saudaveis.reduce((m, s) => (s.indiceRisco < m.indiceRisco ? s : m));
    partes.push(
      `A diferença entre setores é grande: ${pior.setorNome || pior.setor} está em `
      + `${num(pior.indiceRisco, 2)} enquanto ${melhor.setorNome || melhor.setor} está em `
      + `${num(melhor.indiceRisco, 2)} — o que indica um problema localizado, não geral.`
    );
  }

  return {
    tipo: classificacao.nivel,
    titulo: tituloGeral(classificacao.nivel, tendencia),
    texto: partes.join(' '),
  };
}

function tituloGeral(nivel, tendencia) {
  const piorando = tendencia && tendencia.confiavel && tendencia.direcao === 'piorando';
  const melhorando = tendencia && tendencia.confiavel && tendencia.direcao === 'melhorando';

  if (nivel === 'alto') {
    return piorando ? 'Situação crítica e se agravando' : 'Situação crítica';
  }
  if (nivel === 'medio') {
    if (piorando) return 'Atenção: o quadro vem piorando';
    if (melhorando) return 'Quadro moderado, mas melhorando';
    return 'Quadro moderado e estável';
  }
  return melhorando ? 'Situação boa e melhorando' : 'Situação sob controle';
}

/**
 * Escreve o insight de um setor específico, explicando o que está por trás do
 * índice dele.
 */
function insightSetor(setor, serieDoSetor) {
  const medias = {
    estresse: setor.media_estresse,
    sono: setor.media_sono,
    carga_trabalho: setor.media_carga_trabalho,
    ambiente_fisico: setor.media_ambiente_fisico,
  };

  const criticos = analise.indicadoresCriticos(medias);
  const tendencia = analise.calcularTendencia(serieDoSetor || []);
  const nome = setor.setorNome || setor.setor;
  const partes = [];

  partes.push(
    `${nome} está com índice ${num(setor.indiceRisco, 2)} de 5,0 `
    + `(${setor.classificacao.rotulo.toLowerCase()}), com base em `
    + `${setor.total} resposta${setor.total > 1 ? 's' : ''}.`
  );

  if (criticos.length === 0) {
    partes.push('Nenhum indicador isolado passou do limite de atenção.');
  } else {
    const principal = criticos[0];
    partes.push(
      `O fator que mais pesa é ${NOMES_INDICADORES[principal.chave]}, `
      + `com média ${num(principal.mediaBruta)} de 5,0.`
    );

    if (criticos.length > 1) {
      const outros = criticos.slice(1).map((c) => NOMES_INDICADORES[c.chave]);
      partes.push(`Também estão acima do limite: ${listar(outros)}.`);
    }
  }

  if (tendencia.confiavel) {
    if (tendencia.direcao === 'piorando') {
      const dias = analise.diasSeguidosPiorando(serieDoSetor || []);
      partes.push(
        dias >= 2
          ? `O índice sobe há ${dias} dias seguidos — é o momento de agir, antes que o quadro se firme.`
          : 'O índice vem subindo no período.'
      );
    } else if (tendencia.direcao === 'melhorando') {
      partes.push('O índice vem caindo, o que sugere que algo recente está ajudando.');
    }
  }

  return {
    setor: setor.setor,
    setorNome: nome,
    tipo: setor.classificacao.nivel,
    tendencia: tendencia.direcao,
    texto: partes.join(' '),
  };
}

/**
 * Escreve o insight sobre a comparação entre turnos.
 * Só faz sentido com pelo menos dois turnos para comparar.
 */
function insightTurnos(porTurno) {
  if (!porTurno || porTurno.length < 2) return null;

  const ordenado = [...porTurno].sort((a, b) => b.indiceRisco - a.indiceRisco);
  const pior = ordenado[0];
  const melhor = ordenado[ordenado.length - 1];
  const diferenca = pior.indiceRisco - melhor.indiceRisco;

  // Diferença pequena entre turnos não é notícia — dizer "o turno X está
  // 0,05 pior" seria ruído apresentado como informação.
  if (diferenca < 0.4) {
    return {
      tipo: 'baixo',
      texto: 'Os turnos estão equilibrados entre si, sem diferença relevante de risco.',
    };
  }

  // Sem "da"/"do" de propósito: alguns turnos são período (Manhã, Noite,
  // Madrugada — concordam com "da") e outros são adjetivo (Comercial — "da
  // comercial" estaria errado). O nome sozinho funciona nos dois casos.
  const partes = [
    `O turno ${pior.turnoNome} concentra o maior risco `
    + `(${num(pior.indiceRisco, 2)}), contra ${num(melhor.indiceRisco, 2)} `
    + `do turno ${melhor.turnoNome}.`,
  ];

  // Sono é o indicador que mais distingue turnos na prática, então vale
  // apontar quando ele explica a diferença.
  if (pior.media_sono < melhor.media_sono - 0.5) {
    partes.push(
      `A diferença aparece principalmente no sono: ${num(pior.media_sono)} contra `
      + `${num(melhor.media_sono)}, o que é esperado em quem trabalha fora do horário comum.`
    );
  }

  partes.push(
    `Vale checar se a escala e o dimensionamento da equipe do turno `
    + `${pior.turnoNome} estão adequados.`
  );

  return {
    tipo: pior.classificacao.nivel,
    turnoPior: pior.turno,
    texto: partes.join(' '),
  };
}

module.exports = { insightGeral, insightSetor, insightTurnos };
