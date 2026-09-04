// utils/analise.js
// Coração analítico do sistema. Toda regra sobre "o que é risco alto" e
// "o que recomendar" mora aqui, para que o dashboard, os alertas e o
// relatório exportado usem exatamente os mesmos critérios.
//
// ---------------------------------------------------------------------------
// SOBRE AS ESCALAS (importante entender antes de mexer):
//
// Todas as perguntas usam escala 1 a 5, mas elas NÃO apontam para o mesmo lado:
//
//   estresse         → quanto MAIOR, PIOR  (5 = extremamente estressado)
//   carga_trabalho   → quanto MAIOR, PIOR  (5 = sobrecarregado)
//   sono             → quanto MAIOR, MELHOR (5 = dormiu muito bem)
//   ambiente_fisico  → quanto MAIOR, MELHOR (5 = muito confortável)
//
// Para combinar tudo num único índice, invertemos sono e ambiente físico
// com a fórmula (6 - nota). Assim uma nota 5 de sono (ótimo) vira 1 de risco,
// e uma nota 1 de sono (péssimo) vira 5 de risco. Depois disso, TODOS os
// valores seguem a regra "maior = pior".
// ---------------------------------------------------------------------------

const config = require('../config');

// Indicadores onde a nota alta significa algo BOM (precisam ser invertidos)
const INDICADORES_INVERTIDOS = ['sono', 'ambiente_fisico'];

// Nomes amigáveis para exibir na tela e nos relatórios
const NOMES_INDICADORES = {
  estresse: 'Estresse',
  sono: 'Qualidade do sono',
  carga_trabalho: 'Carga de trabalho',
  ambiente_fisico: 'Ambiente físico',
};

// Os setores são gravados no banco sem acento (chaves simples, seguras para
// URL, CSV e banco). Aqui ficam os nomes bonitos usados na interface.
// Assim evitamos problemas de codificação sem abrir mão do português correto.
const NOMES_SETORES = {
  Producao: 'Produção',
  Manutencao: 'Manutenção',
  Qualidade: 'Qualidade',
  Logistica: 'Logística',
  TI: 'TI / Automação',
  Administrativo: 'Administrativo',
};

// Mesma ideia dos setores: a chave é simples e segura para banco e URL, o
// nome acentuado fica aqui, para exibição.
const NOMES_TURNOS = {
  Manha: 'Manhã',
  Tarde: 'Tarde',
  Noite: 'Noite',
};

/** Devolve o nome exibível de um setor; se for desconhecido, usa a própria chave. */
function nomeSetor(chave) {
  return NOMES_SETORES[chave] || chave;
}

/** Devolve o nome exibível de um turno. */
function nomeTurno(chave) {
  return NOMES_TURNOS[chave] || chave;
}

/**
 * Converte a nota bruta de um indicador para "nota de risco",
 * onde 1 = risco mínimo e 5 = risco máximo.
 */
function paraNotaDeRisco(indicador, nota) {
  if (nota === null || nota === undefined) return null;
  return INDICADORES_INVERTIDOS.includes(indicador) ? 6 - nota : nota;
}

/**
 * Recebe as médias brutas dos 4 indicadores e devolve o índice de risco
 * combinado (1 a 5). Retorna null se não houver dados suficientes.
 */
function calcularIndiceRisco(medias) {
  const chaves = ['estresse', 'sono', 'carga_trabalho', 'ambiente_fisico'];
  const notasDeRisco = chaves.map((c) => paraNotaDeRisco(c, medias[c]));

  if (notasDeRisco.some((n) => n === null || Number.isNaN(n))) return null;

  const soma = notasDeRisco.reduce((total, n) => total + n, 0);
  return soma / notasDeRisco.length;
}

/**
 * Classifica um índice numérico em Baixo / Médio / Alto.
 */
function classificarRisco(indice) {
  if (indice === null || indice === undefined || Number.isNaN(indice)) {
    return { nivel: 'indefinido', rotulo: 'Sem dados', cor: '#9aa5ad' };
  }
  if (indice <= config.LIMITES_RISCO.BAIXO_ATE) {
    return { nivel: 'baixo', rotulo: 'Baixo', cor: '#3ddc97' };
  }
  if (indice <= config.LIMITES_RISCO.MEDIO_ATE) {
    return { nivel: 'medio', rotulo: 'Médio', cor: '#e8c547' };
  }
  return { nivel: 'alto', rotulo: 'Alto', cor: '#ff8a5c' };
}

/**
 * Identifica quais indicadores individuais estão acima do limite de alerta.
 * Devolve uma lista já ordenada do pior para o menos crítico.
 */
function indicadoresCriticos(medias) {
  return Object.keys(NOMES_INDICADORES)
    .map((chave) => ({
      chave,
      nome: NOMES_INDICADORES[chave],
      mediaBruta: medias[chave],
      notaDeRisco: paraNotaDeRisco(chave, medias[chave]),
    }))
    .filter((i) => i.notaDeRisco !== null && i.notaDeRisco >= config.LIMITE_ALERTA_INDICADOR)
    .sort((a, b) => b.notaDeRisco - a.notaDeRisco);
}

// Recomendações associadas a cada indicador problemático.
// Foram escritas em linguagem de ação (o que a gestão pode FAZER), não em
// linguagem de diagnóstico, porque o objetivo do painel é gerar decisão.
const RECOMENDACOES = {
  estresse: {
    titulo: 'Estresse elevado na equipe',
    acoes: [
      'Revisar metas e prazos do período — verificar se há acúmulo de cobranças simultâneas.',
      'Garantir que as pausas previstas estejam realmente sendo respeitadas no turno.',
      'Abrir um canal de escuta com a equipe antes que o quadro vire afastamento.',
    ],
  },
  sono: {
    titulo: 'Qualidade de sono baixa',
    acoes: [
      'Avaliar a escala de turnos — trocas frequentes de horário prejudicam o descanso.',
      'Verificar excesso de horas extras ou jornadas encadeadas.',
      'Considerar orientação sobre higiene do sono junto à equipe de saúde ocupacional.',
    ],
  },
  carga_trabalho: {
    titulo: 'Carga de trabalho acima do sustentável',
    acoes: [
      'Redistribuir tarefas entre os turnos ou setores com menor demanda.',
      'Checar se a automação recente transferiu tarefas de supervisão sem reduzir as antigas.',
      'Avaliar necessidade de reforço temporário na equipe.',
    ],
  },
  ambiente_fisico: {
    titulo: 'Ambiente físico desconfortável',
    acoes: [
      'Medir ruído, temperatura e iluminação nos postos apontados.',
      'Revisar ergonomia das estações de trabalho e postos de operação.',
      'Verificar se equipamentos novos alteraram o layout sem readequação do posto.',
    ],
  },
};

/**
 * Monta a lista de recomendações a partir das médias de um grupo
 * (geral ou de um setor específico).
 */
function gerarRecomendacoes(medias) {
  const criticos = indicadoresCriticos(medias);

  if (criticos.length === 0) {
    return [{
      titulo: 'Nenhum indicador crítico no momento',
      acoes: ['Manter o acompanhamento periódico e incentivar o preenchimento contínuo do formulário.'],
      indicador: null,
    }];
  }

  return criticos.map((c) => ({
    indicador: c.chave,
    titulo: RECOMENDACOES[c.chave].titulo,
    acoes: RECOMENDACOES[c.chave].acoes,
    mediaBruta: Number(c.mediaBruta.toFixed(2)),
  }));
}

/**
 * Gera recomendações separadas para CADA setor que esteja em risco médio ou alto.
 *
 * POR QUE ISSO EXISTE: usar só a média geral esconde problemas. Se a Produção
 * está em crise mas o setor de TI está ótimo, a média dos dois fica "aceitável"
 * e nenhuma recomendação seria disparada — justamente no caso em que a empresa
 * mais precisaria agir. Analisando setor a setor, o problema aparece onde ele
 * realmente está.
 */
function gerarRecomendacoesPorSetor(porSetor, seriesPorSetor = {}) {
  return porSetor
    .filter((s) => s.total >= config.MINIMO_RESPOSTAS_ALERTA)
    .map((s) => {
      const medias = {
        estresse: s.media_estresse,
        sono: s.media_sono,
        carga_trabalho: s.media_carga_trabalho,
        ambiente_fisico: s.media_ambiente_fisico,
      };
      const indice = calcularIndiceRisco(medias);
      const classificacao = classificarRisco(indice);
      const criticos = indicadoresCriticos(medias);

      const serie = seriesPorSetor[s.setor] || [];
      const tendencia = calcularTendencia(serie);
      const diasPiorando = diasSeguidosPiorando(serie);

      const blocos = criticos.map((c) => ({
        indicador: c.chave,
        titulo: RECOMENDACOES[c.chave].titulo,
        acoes: RECOMENDACOES[c.chave].acoes,
        mediaBruta: Number(c.mediaBruta.toFixed(2)),
      }));

      // Um setor pode estar piorando de forma consistente sem que nenhum
      // indicador tenha cruzado o limite ainda. Ignorá-lo seria esperar o
      // problema se instalar para só então avisar — o oposto do que o sistema
      // se propõe a fazer. Nesse caso a recomendação é sobre a própria
      // tendência, não sobre um indicador específico.
      if (blocos.length === 0 && tendencia.confiavel && tendencia.direcao === 'piorando') {
        const piorIndicador = Object.keys(NOMES_INDICADORES)
          .map((chave) => ({ chave, nota: paraNotaDeRisco(chave, s[`media_${chave}`]) }))
          .sort((a, b) => b.nota - a.nota)[0];

        blocos.push({
          indicador: 'tendencia',
          titulo: 'Piora consistente, ainda dentro do limite',
          acoes: [
            `Os indicadores subiram ${Math.abs(tendencia.variacao).toFixed(2)} ponto(s) `
              + `ao longo dos últimos ${tendencia.diasAnalisados} dias.`,
            `O que mais pesa hoje é ${NOMES_INDICADORES[piorIndicador.chave].toLowerCase()}.`,
            'Ainda dá para agir antes de o quadro chegar ao nível de alerta — '
              + 'verifique o que mudou na rotina do setor nesse período.',
          ],
          mediaBruta: null,
        });
      }

      return {
        setor: s.setor,
        setorNome: nomeSetor(s.setor),
        total: s.total,
        indiceRisco: Number(indice.toFixed(2)),
        classificacao,
        tendencia,
        diasPiorando,
        // Urgência combina gravidade com direção: um setor em risco alto e
        // piorando precisa de ação hoje; o mesmo risco em queda pode esperar,
        // porque o que já foi feito está surtindo efeito.
        urgencia: definirUrgencia(classificacao.nivel, tendencia.direcao),
        recomendacoes: blocos,
      };
    })
    // Só mostra setores que realmente têm algo a corrigir
    .filter((s) => s.recomendacoes.length > 0)
    // Ordena pela urgência, e só depois pelo índice. Assim um setor em risco
    // alto e piorando aparece antes de outro com índice maior mas em queda.
    .sort((a, b) => a.urgencia.peso - b.urgencia.peso || b.indiceRisco - a.indiceRisco);
}

// ---------------------------------------------------------------------------
// Tendência
//
// Saber que um setor está em risco alto é útil. Saber que ele está em risco
// alto E PIORANDO há vários dias é o que faz a gestão agir hoje em vez de na
// semana que vem. Esta parte compara o começo do período com o fim para
// descobrir a direção do movimento.
// ---------------------------------------------------------------------------

// Quanto o índice precisa variar para deixar de ser considerado estável.
// Abaixo disso é oscilação normal do dia a dia, não tendência: uma variação de
// 0,1 num índice de 1 a 5 pode vir de uma única pessoa respondendo diferente.
const VARIACAO_MINIMA = 0.25;

// Mínimo de dias com respostas para arriscar dizer que existe uma tendência.
// Com menos que isso, dois dias ruins seguidos pareceriam uma piora
// consistente — e provavelmente eram só dois dias ruins.
const DIAS_MINIMOS_TENDENCIA = 4;

/**
 * Calcula a tendência a partir de uma série de pontos com índice de risco.
 *
 * @param serie lista ordenada por data, cada item com { indiceRisco }
 * @returns { direcao, variacao, confiavel, rotulo }
 *
 * COMO FUNCIONA: divide o período em duas metades e compara a média de cada
 * uma. Usar médias, e não o primeiro e o último dia, evita que um único dia
 * atípico defina a leitura de todo o período.
 */
function calcularTendencia(serie) {
  const semDados = {
    direcao: 'indefinida',
    variacao: 0,
    confiavel: false,
    rotulo: 'sem dados suficientes',
  };

  if (!Array.isArray(serie) || serie.length < DIAS_MINIMOS_TENDENCIA) {
    return semDados;
  }

  const valores = serie
    .map((p) => p.indiceRisco)
    .filter((v) => typeof v === 'number' && !Number.isNaN(v));

  if (valores.length < DIAS_MINIMOS_TENDENCIA) return semDados;

  // Com número ímpar de dias, o do meio fica de fora das duas metades — ele
  // não ajuda a distinguir começo de fim.
  const meio = Math.floor(valores.length / 2);
  const primeiraMetade = valores.slice(0, meio);
  const segundaMetade = valores.slice(valores.length - meio);

  const media = (lista) => lista.reduce((s, v) => s + v, 0) / lista.length;

  const antes = media(primeiraMetade);
  const depois = media(segundaMetade);
  const variacao = depois - antes;

  let direcao;
  let rotulo;

  if (Math.abs(variacao) < VARIACAO_MINIMA) {
    direcao = 'estavel';
    rotulo = 'estável';
  } else if (variacao > 0) {
    direcao = 'piorando';
    rotulo = 'piorando';
  } else {
    direcao = 'melhorando';
    rotulo = 'melhorando';
  }

  return {
    direcao,
    variacao: Number(variacao.toFixed(2)),
    confiavel: true,
    rotulo,
    diasAnalisados: valores.length,
  };
}

// Até quantos dias à frente vale a pena extrapolar. Além disso, a projeção
// deixa de ser informação e vira chute: nada garante que o ritmo das últimas
// duas semanas continue igual por mais um mês.
const HORIZONTE_MAXIMO_DIAS = 30;

/**
 * Estima em quantos dias um setor cruza o limite de risco alto, mantido o
 * ritmo atual de piora.
 *
 * @param serie lista ordenada por data, cada item com { indiceRisco }
 * @param indiceAtual índice de risco do setor hoje
 * @returns { dias, limite, mensagem } ou null quando não dá para prever
 *
 * COMO FUNCIONA: reaproveita a variação já calculada por calcularTendencia(),
 * que é a diferença entre a média da segunda metade e a da primeira. Como os
 * centros dessas duas metades ficam a meio período de distância, dividir a
 * variação por essa distância dá o ritmo diário de piora. O resto é regra de
 * três até o limite.
 *
 * POR QUE SÓ EM CASO DE PIORA: projetar um setor estável ou melhorando daria
 * um número sem significado — e um painel que anuncia crise onde não há
 * ensina o gestor a ignorar o painel.
 */
function preverDiasAteCritico(serie, indiceAtual) {
  if (typeof indiceAtual !== 'number' || Number.isNaN(indiceAtual)) return null;

  const limite = config.LIMITES_RISCO.MEDIO_ATE;

  // Já está em risco alto: não há o que prever, o problema é agora.
  if (indiceAtual > limite) return null;

  const tendencia = calcularTendencia(serie);
  if (!tendencia.confiavel || tendencia.direcao !== 'piorando') return null;

  const distanciaEntreMetades = tendencia.diasAnalisados / 2;
  const ritmoPorDia = tendencia.variacao / distanciaEntreMetades;
  if (ritmoPorDia <= 0) return null;

  const dias = Math.ceil((limite - indiceAtual) / ritmoPorDia);
  if (dias < 1 || dias > HORIZONTE_MAXIMO_DIAS) return null;

  return {
    dias,
    limite: Number(limite.toFixed(2)),
    mensagem: dias === 1
      ? 'pode chegar a risco alto amanhã se o ritmo continuar'
      : `pode chegar a risco alto em ${dias} dias se o ritmo continuar`,
  };
}

/**
 * Conta há quantos dias seguidos o índice vem subindo, olhando do fim para o
 * começo. Serve para dizer "piorando há 5 dias" em vez de só "piorando".
 */
function diasSeguidosPiorando(serie) {
  if (!Array.isArray(serie) || serie.length < 2) return 0;

  let dias = 0;
  for (let i = serie.length - 1; i > 0; i--) {
    if (serie[i].indiceRisco > serie[i - 1].indiceRisco) dias++;
    else break;
  }
  return dias;
}

/**
 * Combina o nível de risco com a direção da tendência para definir quanto o
 * caso é urgente. É o que diferencia "está ruim mas melhorando" de "está ruim
 * e piorando" — situações que pedem reações diferentes.
 */
function definirUrgencia(nivel, direcao) {
  if (nivel === 'alto' && direcao === 'piorando') {
    return { peso: 0, rotulo: 'Agir agora', descricao: 'Risco alto e piorando.' };
  }
  if (nivel === 'alto') {
    return { peso: 1, rotulo: 'Prioridade', descricao: 'Risco alto.' };
  }
  if (nivel === 'medio' && direcao === 'piorando') {
    return { peso: 2, rotulo: 'Atenção', descricao: 'Risco médio e subindo.' };
  }
  if (nivel === 'medio') {
    return { peso: 3, rotulo: 'Acompanhar', descricao: 'Risco médio.' };
  }
  if (direcao === 'piorando') {
    return { peso: 4, rotulo: 'De olho', descricao: 'Risco baixo, mas subindo.' };
  }
  return { peso: 5, rotulo: 'Estável', descricao: 'Sem sinal de agravamento.' };
}

/**
 * Gera os alertas que aparecem no topo do dashboard.
 * Só considera setores com um mínimo de respostas, para evitar alarme falso
 * causado por uma única pessoa respondendo em um dia ruim.
 */
function gerarAlertas(porSetor, seriesPorSetor = {}) {
  const alertas = [];

  porSetor.forEach((setor) => {
    if (setor.total < config.MINIMO_RESPOSTAS_ALERTA) return;

    const medias = {
      estresse: setor.media_estresse,
      sono: setor.media_sono,
      carga_trabalho: setor.media_carga_trabalho,
      ambiente_fisico: setor.media_ambiente_fisico,
    };

    const indice = calcularIndiceRisco(medias);
    const classificacao = classificarRisco(indice);
    const serie = seriesPorSetor[setor.setor] || [];
    const tendencia = calcularTendencia(serie);
    const diasPiorando = diasSeguidosPiorando(serie);
    const previsao = preverDiasAteCritico(serie, indice);

    // Complemento sobre a direção do movimento. Só entra quando há dias
    // suficientes para a leitura ser confiável — dizer "piorando" com base em
    // dois dias seria chute apresentado como informação.
    let complemento = '';
    if (tendencia.confiavel && tendencia.direcao === 'piorando') {
      complemento = diasPiorando >= 2
        ? ` E vem piorando há ${diasPiorando} dias.`
        : ' E a tendência é de piora.';
    } else if (tendencia.confiavel && tendencia.direcao === 'melhorando') {
      complemento = ' A tendência é de melhora.';
    }

    if (classificacao.nivel === 'alto') {
      const criticos = indicadoresCriticos(medias);
      const principal = criticos.length > 0 ? criticos[0].nome : 'indicadores gerais';
      alertas.push({
        gravidade: 'alto',
        setor: setor.setor,
        setorNome: nomeSetor(setor.setor),
        indice: Number(indice.toFixed(2)),
        tendencia: tendencia.direcao,
        diasPiorando,
        previsao,
        mensagem: `${nomeSetor(setor.setor)} está em risco alto. `
          + `Fator principal: ${principal.toLowerCase()}.${complemento}`,
      });
    } else if (classificacao.nivel === 'medio') {
      alertas.push({
        gravidade: 'medio',
        setor: setor.setor,
        setorNome: nomeSetor(setor.setor),
        indice: Number(indice.toFixed(2)),
        tendencia: tendencia.direcao,
        diasPiorando,
        previsao,
        mensagem: `${nomeSetor(setor.setor)} está em risco médio.${complemento || ' Vale acompanhar de perto.'}`,
      });
    } else if (tendencia.confiavel && tendencia.direcao === 'piorando' && diasPiorando >= 3) {
      // Risco ainda baixo, mas subindo de forma consistente. Avisar agora é
      // justamente o que permite agir antes de virar problema — que é a
      // proposta do sistema.
      alertas.push({
        gravidade: 'medio',
        setor: setor.setor,
        setorNome: nomeSetor(setor.setor),
        indice: Number(indice.toFixed(2)),
        tendencia: 'piorando',
        diasPiorando,
        previsao,
        mensagem: `${nomeSetor(setor.setor)} ainda está em risco baixo, `
          + `mas vem piorando há ${diasPiorando} dias.`,
      });
    }
  });

  // Alertas mais graves primeiro; entre iguais, quem está piorando vem antes
  const ordem = { alto: 0, medio: 1 };
  return alertas.sort((a, b) => {
    if (ordem[a.gravidade] !== ordem[b.gravidade]) {
      return ordem[a.gravidade] - ordem[b.gravidade];
    }
    const pioraA = a.tendencia === 'piorando' ? 0 : 1;
    const pioraB = b.tendencia === 'piorando' ? 0 : 1;
    if (pioraA !== pioraB) return pioraA - pioraB;
    return b.indice - a.indice;
  });
}

module.exports = {
  NOMES_INDICADORES,
  NOMES_SETORES,
  NOMES_TURNOS,
  nomeSetor,
  nomeTurno,
  paraNotaDeRisco,
  calcularIndiceRisco,
  classificarRisco,
  indicadoresCriticos,
  gerarRecomendacoes,
  gerarRecomendacoesPorSetor,
  calcularTendencia,
  diasSeguidosPiorando,
  preverDiasAteCritico,
  definirUrgencia,
  gerarAlertas,
};
