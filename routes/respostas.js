// routes/respostas.js
// Rotas das respostas do formulário de risco psicossocial.
//
// Pública (o trabalhador usa sem login):
//   POST /api/respostas             → envia uma resposta
//
// Protegidas (exigem login de gestão):
//   GET  /api/respostas                    → lista respostas
//   GET  /api/respostas/resumo             → médias, índice, alertas e recomendações
//   POST /api/respostas/setores/:setor/acao → marca que a gestão agiu sobre o alerta
//   GET  /api/respostas/turnos             → risco por turno de trabalho
//   GET  /api/respostas/evolucao           → série temporal para o gráfico de linha
//   GET  /api/respostas/comentarios        → comentários deixados
//   GET  /api/respostas/exportar           → baixa tudo em CSV
//   GET  /api/respostas/exportar-pdf       → relatório do período em PDF

const express = require('express');
const router = express.Router();
const { Resposta, SETORES } = require('../models/Resposta');
const { AcaoAlerta } = require('../models/AcaoAlerta');
const { exigirLogin } = require('../middleware/auth');
const analise = require('../utils/analise');
const insights = require('../utils/insights');
const { gerarPdfResumo } = require('../utils/pdf');
const email = require('../utils/email');
const config = require('../config');
const { limiteFormulario, limiteAcaoAlerta } = require('../middleware/limites');

// ---------------------------------------------------------------------------
// Filtro de período (?periodo=7, 30 ou tudo)
//
// Calculamos a data de corte no servidor e comparamos com $gte. Usamos
// "-6 dias" para os últimos 7 porque o dia de hoje já conta como o sétimo.
// ---------------------------------------------------------------------------
/**
 * Devolve o início (00:00) do dia que fica `diasAtras` dias antes de hoje, no
 * fuso do sistema. Não usa setHours: isso zera a hora no fuso do servidor, que
 * no Render é UTC — e então o período começaria às 21h do dia anterior em
 * Brasília.
 */
function inicioDoDia(diasAtras) {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.FUSO_HORARIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const [ano, mes, dia] = hoje.split('-').map(Number);
  const dataLocal = new Date(Date.UTC(ano, mes - 1, dia - diasAtras)).toISOString().slice(0, 10);

  // Brasília não tem horário de verão desde 2019, então o deslocamento é fixo.
  return new Date(`${dataLocal}T00:00:00-03:00`);
}

function filtroPeriodo(periodo) {
  const dias = periodo === '7' ? 7 : periodo === '30' ? 30 : null;

  if (dias === null) {
    return { match: {}, rotulo: 'Todo o período' };
  }

  const corte = inicioDoDia(dias - 1);

  return {
    match: { data_envio: { $gte: corte } },
    rotulo: dias === 7 ? 'Últimos 7 dias' : 'Últimos 30 dias',
  };
}

/**
 * Monta os cálculos de média usados em vários pipelines.
 * Centralizado aqui para que resumo, setores e evolução usem exatamente as
 * mesmas contas — se um dia mudar, muda em um lugar só.
 */
function camposDeMedia() {
  return {
    total: { $sum: 1 },
    media_estresse: { $avg: '$estresse' },
    media_sono: { $avg: '$sono' },
    media_carga_trabalho: { $avg: '$carga_trabalho' },
    media_ambiente_fisico: { $avg: '$ambiente_fisico' },
  };
}

/** Converte a saída do $group (que usa _id) para o formato que o front espera. */
function comoSetor(documento) {
  const { _id, ...resto } = documento;
  return { setor: _id, ...resto };
}

// Quantos dias antes da ação entram na janela de "antes". A janela de
// "depois" fica em aberto (da ação até agora) — não faz sentido cortá-la
// cedo, já que é exatamente esse período que diz se a ação está funcionando.
const JANELA_EFEITO_ACAO_DIAS = 7;

/**
 * Compara o índice de risco do setor antes e depois de uma ação registrada.
 *
 * NÃO mede se a ação "causou" a mudança — só compara as duas médias. Some
 * dados no meio caminho é intencional: um setor pode ter caído em risco
 * baixo por outros motivos, e cabe à gestão interpretar o número, não ao
 * sistema apontar causa.
 *
 * Devolve null quando não há respostas suficientes de um dos dois lados
 * para a comparação valer alguma coisa — mostrar uma média de 1 resposta
 * como "resultado da ação" seria dar confiança a um número que não tem.
 */
async function calcularEfeitoAcao(setor, dataAcao) {
  const inicioAntes = new Date(dataAcao);
  inicioAntes.setDate(inicioAntes.getDate() - JANELA_EFEITO_ACAO_DIAS);

  const [resultadoAntes, resultadoDepois] = await Promise.all([
    Resposta.aggregate([
      { $match: { setor, data_envio: { $gte: inicioAntes, $lt: dataAcao } } },
      { $group: { _id: null, ...camposDeMedia() } },
    ]),
    Resposta.aggregate([
      { $match: { setor, data_envio: { $gte: dataAcao } } },
      { $group: { _id: null, ...camposDeMedia() } },
    ]),
  ]);

  const antes = resultadoAntes[0];
  const depois = resultadoDepois[0];
  const minimo = config.MINIMO_RESPOSTAS_ALERTA;

  if (!antes || !depois || antes.total < minimo || depois.total < minimo) {
    return null;
  }

  const indiceAntes = analise.calcularIndiceRisco({
    estresse: antes.media_estresse,
    sono: antes.media_sono,
    carga_trabalho: antes.media_carga_trabalho,
    ambiente_fisico: antes.media_ambiente_fisico,
  });
  const indiceDepois = analise.calcularIndiceRisco({
    estresse: depois.media_estresse,
    sono: depois.media_sono,
    carga_trabalho: depois.media_carga_trabalho,
    ambiente_fisico: depois.media_ambiente_fisico,
  });

  const variacao = indiceDepois - indiceAntes;
  // Mesmo limiar usado para decidir tendência (ver utils/analise.js) — abaixo
  // dele é oscilação normal, não uma mudança real de patamar.
  let direcao = 'estavel';
  if (variacao <= -analise.VARIACAO_MINIMA) direcao = 'melhorou';
  else if (variacao >= analise.VARIACAO_MINIMA) direcao = 'piorou';

  return {
    indiceAntes: Number(indiceAntes.toFixed(2)),
    indiceDepois: Number(indiceDepois.toFixed(2)),
    variacao: Number(variacao.toFixed(2)),
    direcao,
  };
}

// Só olha os últimos 30 dias do setor — o mesmo horizonte que o painel usa
// por padrão — para decidir se ele está em risco alto agora, não desde
// sempre. Roda em segundo plano, sem atrasar a resposta ao formulário: quem
// respondeu não deveria esperar um envio de e-mail para ver a confirmação.
async function verificarAlertaEmail(setor) {
  const corte = inicioDoDia(29);

  const [resultado] = await Resposta.aggregate([
    { $match: { setor, data_envio: { $gte: corte } } },
    { $group: { _id: null, ...camposDeMedia() } },
  ]);

  if (!resultado || resultado.total < config.MINIMO_RESPOSTAS_ALERTA) return;

  const indice = analise.calcularIndiceRisco({
    estresse: resultado.media_estresse,
    sono: resultado.media_sono,
    carga_trabalho: resultado.media_carga_trabalho,
    ambiente_fisico: resultado.media_ambiente_fisico,
  });
  const { nivel } = analise.classificarRisco(indice);

  if (email.precisaAvisar(setor, nivel)) {
    await email.avisarRiscoAlto(analise.nomeSetor(setor), indice);
  }
}

// ---------------------------------------------------------------------------
// POST /api/respostas — pública
// ---------------------------------------------------------------------------
router.post('/', limiteFormulario, async (req, res) => {
  try {
    const { setor, turno, estresse, sono, carga_trabalho, ambiente_fisico, comentario } = req.body;

    const resposta = new Resposta({
      setor,
      turno,
      estresse,
      sono,
      carga_trabalho,
      ambiente_fisico,
      comentario: comentario || null,
    });

    // O Mongoose valida contra as regras declaradas em models/Resposta.js
    // (setor existe? nota entre 1 e 5? é inteiro?). Não repetimos essas
    // verificações aqui para não ter duas fontes de verdade discordando.
    await resposta.save();

    res.status(201).json({
      id: resposta._id,
      mensagem: 'Resposta registrada com sucesso.',
    });

    // Depois de responder — nada aqui deve atrasar nem quebrar a confirmação
    // que a pessoa já recebeu.
    verificarAlertaEmail(resposta.setor).catch((erro) =>
      console.error('Erro ao verificar alerta de e-mail:', erro.message));
    req.app.get('io')?.emit('painel:atualizado', { tipo: 'resposta' });
  } catch (erro) {
    if (erro.name === 'ValidationError') {
      // Devolve a primeira mensagem de erro, já escrita em português no model
      // — exceto quando essa "primeira mensagem" é um CastError (ex.: nota
      // enviada como texto em vez de número). O Mongoose gera a mensagem de
      // CastError sozinho, em inglês, e não existe onde sobrescrevê-la
      // campo a campo em models/Resposta.js como existe para min/max/required.
      const primeira = Object.values(erro.errors)[0];
      const mensagem = primeira.name === 'CastError'
        ? 'Alguma resposta está em um formato inválido. Confira se todas as notas são números de 1 a 5.'
        : primeira.message;
      return res.status(400).json({ erro: mensagem });
    }
    console.error('Erro ao salvar resposta:', erro.message);
    res.status(500).json({ erro: 'Erro ao salvar resposta no banco.' });
  }
});

// ---------------------------------------------------------------------------
// Daqui para baixo, tudo exige login de gestão
// ---------------------------------------------------------------------------
router.use(exigirLogin);

// GET /api/respostas
router.get('/', async (req, res) => {
  try {
    const { match } = filtroPeriodo(req.query.periodo);
    // Mesmo limite de routes/logs.js: sem um teto, a listagem cresce junto
    // com o banco. Não afeta /exportar, que é a rota feita de propósito para
    // trazer tudo — só esta, que ninguém no front-end usa hoje para carregar
    // uma lista inteira de uma vez.
    const limite = Math.min(Number(req.query.limite) || 100, 500);
    const respostas = await Resposta.find(match).sort({ data_envio: -1 }).limit(limite).lean();
    res.json(respostas);
  } catch (erro) {
    console.error('Erro ao buscar respostas:', erro.message);
    res.status(500).json({ erro: 'Erro ao buscar respostas.' });
  }
});

// GET /api/respostas/resumo — dado principal do painel
// Monta o resumo do painel. Separado da rota para o PDF usar exatamente os
// mesmos números que a tela mostra.
async function montarResumo(periodo) {
    const { match, rotulo } = filtroPeriodo(periodo);

    // Os agrupamentos são independentes, então rodam em paralelo
    const [resultadoGeral, resultadoPorSetor, resultadoPorTurno, resultadoEvolucaoSetor] =
      await Promise.all([
        Resposta.aggregate([
          { $match: match },
          { $group: { _id: null, ...camposDeMedia(), ultima_resposta: { $max: '$data_envio' } } },
        ]),
        Resposta.aggregate([
          { $match: match },
          { $group: { _id: '$setor', ...camposDeMedia() } },
          { $sort: { _id: 1 } },
        ]),
        Resposta.aggregate([
          { $match: match },
          { $group: { _id: '$turno', ...camposDeMedia() } },
        ]),
        // Evolução dia a dia de CADA setor, usada para calcular a tendência.
        // Sem isso saberíamos apenas o estado atual — e "risco alto e piorando
        // há 5 dias" exige uma reação mais rápida do que "risco alto, mas
        // melhorando".
        Resposta.aggregate([
          { $match: match },
          {
            $group: {
              _id: {
                setor: '$setor',
                dia: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$data_envio',
                    timezone: config.FUSO_HORARIO,
                  },
                },
              },
              ...camposDeMedia(),
            },
          },
          { $sort: { '_id.dia': 1 } },
        ]),
      ]);

    const geral = resultadoGeral[0];

    // Período sem nenhuma resposta: devolve uma estrutura vazia coerente em
    // vez de erro, para o painel conseguir exibir a tela de "sem dados".
    if (!geral || geral.total === 0) {
      return {
        periodo: rotulo,
        geral: { total: 0 },
        porSetor: [],
        porTurno: [],
        indiceRisco: null,
        classificacao: analise.classificarRisco(null),
        alertas: [],
        recomendacoes: [],
        recomendacoesPorSetor: [],
        // O front espera esta estrutura sempre; devolvê-la vazia evita ter
        // que checar existência em cada uso.
        insights: {
          geral: insights.insightGeral({ geral: { total: 0 }, porSetor: [], periodo: rotulo }),
          porSetor: [],
          turnos: null,
        },
      };
    }

    const medias = {
      estresse: geral.media_estresse,
      sono: geral.media_sono,
      carga_trabalho: geral.media_carga_trabalho,
      ambiente_fisico: geral.media_ambiente_fisico,
    };

    // Monta a série diária de cada setor, para calcular a tendência.
    // Chave = nome do setor, valor = lista de dias em ordem cronológica.
    const seriesPorSetor = {};
    resultadoEvolucaoSetor.forEach((linha) => {
      const setor = linha._id.setor;
      const medias = {
        estresse: linha.media_estresse,
        sono: linha.media_sono,
        carga_trabalho: linha.media_carga_trabalho,
        ambiente_fisico: linha.media_ambiente_fisico,
      };
      if (!seriesPorSetor[setor]) seriesPorSetor[setor] = [];
      seriesPorSetor[setor].push({
        dia: linha._id.dia,
        indiceRisco: analise.calcularIndiceRisco(medias),
      });
    });

    // Garante a ordem cronológica dentro de cada setor. O $sort da agregação
    // ordena o conjunto todo, mas ao separar por setor a ordem relativa
    // precisa ser confirmada antes de falar em "tendência".
    Object.values(seriesPorSetor).forEach((serie) =>
      serie.sort((a, b) => a.dia.localeCompare(b.dia))
    );

    const indiceRisco = analise.calcularIndiceRisco(medias);
    const porSetor = resultadoPorSetor.map(comoSetor);

    // Cada setor já sai daqui com o índice calculado, para o front não
    // precisar repetir a fórmula das escalas invertidas.
    const setoresComIndice = porSetor.map((s) => {
      const mediasSetor = {
        estresse: s.media_estresse,
        sono: s.media_sono,
        carga_trabalho: s.media_carga_trabalho,
        ambiente_fisico: s.media_ambiente_fisico,
      };
      const indice = analise.calcularIndiceRisco(mediasSetor);
      const serie = seriesPorSetor[s.setor] || [];
      const tendencia = analise.calcularTendencia(serie);

      return {
        ...s,
        setorNome: analise.nomeSetor(s.setor),
        indiceRisco: Number(indice.toFixed(2)),
        classificacao: analise.classificarRisco(indice),
        tendencia,
        diasPiorando: analise.diasSeguidosPiorando(serie),
      };
    });

    // Turnos seguem a ordem natural do dia (manhã, tarde, noite) em vez da
    // alfabética, que colocaria "Manha, Noite, Tarde" e confundiria a leitura
    // do gráfico.
    const ORDEM_TURNOS = ['Manha', 'Tarde', 'Noite'];
    const turnosComIndice = resultadoPorTurno
      .map((t) => {
        const mediasTurno = {
          estresse: t.media_estresse,
          sono: t.media_sono,
          carga_trabalho: t.media_carga_trabalho,
          ambiente_fisico: t.media_ambiente_fisico,
        };
        const indice = analise.calcularIndiceRisco(mediasTurno);
        return {
          turno: t._id,
          turnoNome: analise.nomeTurno(t._id),
          total: t.total,
          media_estresse: t.media_estresse,
          media_sono: t.media_sono,
          media_carga_trabalho: t.media_carga_trabalho,
          media_ambiente_fisico: t.media_ambiente_fisico,
          indiceRisco: Number(indice.toFixed(2)),
          classificacao: analise.classificarRisco(indice),
        };
      })
      .sort((a, b) => ORDEM_TURNOS.indexOf(a.turno) - ORDEM_TURNOS.indexOf(b.turno));

    const classificacaoGeral = analise.classificarRisco(indiceRisco);

    // Tendência do conjunto: junta os dias de todos os setores numa série só.
    // É o que permite dizer "o quadro geral vem piorando", e não apenas
    // apontar setores isolados.
    const seriGeral = Object.values(seriesPorSetor)
      .flat()
      .reduce((acc, ponto) => {
        const existente = acc.find((p) => p.dia === ponto.dia);
        if (existente) {
          existente.soma += ponto.indiceRisco;
          existente.qtd += 1;
        } else {
          acc.push({ dia: ponto.dia, soma: ponto.indiceRisco, qtd: 1 });
        }
        return acc;
      }, [])
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((p) => ({ dia: p.dia, indiceRisco: p.soma / p.qtd }));

    const tendenciaGeral = analise.calcularTendencia(seriGeral);
    const recomendacoesPorSetor = analise.gerarRecomendacoesPorSetor(porSetor, seriesPorSetor);

    // Anexa a última ação registrada (se houver) a cada setor que aparece
    // nas recomendações — é o que permite ao painel mostrar "ação já
    // registrada" em vez de deixar o gestor sem saber se alguém já agiu.
    if (recomendacoesPorSetor.length > 0) {
      const acoes = await AcaoAlerta.find({
        setor: { $in: recomendacoesPorSetor.map((s) => s.setor) },
      }).sort({ criadoEm: -1 }).lean();

      for (const setor of recomendacoesPorSetor) {
        const ultima = acoes.find((a) => a.setor === setor.setor);
        setor.ultimaAcao = ultima
          ? {
              criadoPor: ultima.criadoPor,
              criadoEm: ultima.criadoEm,
              observacao: ultima.observacao,
              efeito: await calcularEfeitoAcao(setor.setor, ultima.criadoEm),
            }
          : null;
      }
    }

    return {
      periodo: rotulo,
      geral,
      porSetor: setoresComIndice,
      porTurno: turnosComIndice,
      indiceRisco: Number(indiceRisco.toFixed(2)),
      classificacao: classificacaoGeral,
      tendencia: tendenciaGeral,
      alertas: analise.gerarAlertas(porSetor, seriesPorSetor),
      recomendacoes: analise.gerarRecomendacoes(medias),
      recomendacoesPorSetor,

      // Textos gerados a partir dos números acima. Ver utils/insights.js —
      // são regras explícitas, não modelo de linguagem.
      insights: {
        geral: insights.insightGeral({
          geral,
          porSetor: setoresComIndice,
          indiceRisco,
          classificacao: classificacaoGeral,
          tendencia: tendenciaGeral,
          periodo: rotulo,
        }),
        porSetor: setoresComIndice
          // Só escrevemos sobre setores que exigem alguma leitura. Gerar um
          // parágrafo para cada setor saudável encheria a tela de texto sem
          // informação nova.
          .filter((s) => s.classificacao.nivel !== 'baixo')
          .map((s) => insights.insightSetor(s, seriesPorSetor[s.setor] || []))
          .slice(0, 4),
        turnos: insights.insightTurnos(turnosComIndice),
      },
    };
}

router.get('/resumo', async (req, res) => {
  try {
    res.json(await montarResumo(req.query.periodo));
  } catch (erro) {
    console.error('Erro ao calcular resumo:', erro.message);
    res.status(500).json({ erro: 'Erro ao calcular resumo.' });
  }
});

// POST /api/respostas/setores/:setor/acao — marca que a gestão agiu sobre o
// alerta daquele setor. O efeito da ação (índice antes/depois) é calculado à
// parte, em calcularEfeitoAcao, e anexado quando o painel busca o resumo —
// esta rota só registra que alguém viu e fez algo a respeito.
router.post('/setores/:setor/acao', limiteAcaoAlerta, async (req, res) => {
  const { setor } = req.params;

  if (!Object.keys(SETORES).includes(setor)) {
    return res.status(400).json({ erro: 'Setor inválido.' });
  }

  const observacao = req.body?.observacao ? String(req.body.observacao).trim() : null;
  if (observacao && observacao.length > 300) {
    return res.status(400).json({ erro: 'A observação pode ter no máximo 300 caracteres.' });
  }

  try {
    const acao = await AcaoAlerta.create({
      setor,
      criadoPor: req.usuario.nome || req.usuario.email,
      observacao,
    });
    res.status(201).json({
      setor: acao.setor,
      criadoPor: acao.criadoPor,
      criadoEm: acao.criadoEm,
      observacao: acao.observacao,
    });
    req.app.get('io')?.emit('painel:atualizado', { tipo: 'acao', setor });
  } catch (erro) {
    console.error('Erro ao registrar ação de alerta:', erro.message);
    res.status(500).json({ erro: 'Erro ao registrar a ação.' });
  }
});

// GET /api/respostas/turnos — risco por turno de trabalho
//
// Só considera respostas que informaram o turno. As gravadas antes desta
// funcionalidade existir têm o campo vazio e ficariam agrupadas sob um turno
// "null", poluindo o gráfico com uma barra que não significa nada.
router.get('/turnos', async (req, res) => {
  try {
    const { match } = filtroPeriodo(req.query.periodo);

    const linhas = await Resposta.aggregate([
      { $match: { ...match, turno: { $ne: null } } },
      { $group: { _id: '$turno', ...camposDeMedia() } },
    ]);

    const serie = linhas.map((l) => {
      const medias = {
        estresse: l.media_estresse,
        sono: l.media_sono,
        carga_trabalho: l.media_carga_trabalho,
        ambiente_fisico: l.media_ambiente_fisico,
      };
      const indice = analise.calcularIndiceRisco(medias);
      return {
        turno: l._id,
        turnoNome: analise.nomeTurno(l._id),
        total: l.total,
        indiceRisco: Number(indice.toFixed(2)),
        classificacao: analise.classificarRisco(indice),
        media_estresse: Number(l.media_estresse.toFixed(2)),
        media_sono: Number(l.media_sono.toFixed(2)),
        media_carga_trabalho: Number(l.media_carga_trabalho.toFixed(2)),
        media_ambiente_fisico: Number(l.media_ambiente_fisico.toFixed(2)),
      };
    });

    // Ordena na sequência natural do dia, não por risco: o gráfico fica mais
    // fácil de ler quando manhã, tarde e noite aparecem sempre na mesma ordem.
    const ordem = { Manha: 0, Tarde: 1, Noite: 2 };
    serie.sort((a, b) => (ordem[a.turno] ?? 9) - (ordem[b.turno] ?? 9));

    res.json(serie);
  } catch (erro) {
    console.error('Erro ao calcular risco por turno:', erro.message);
    res.status(500).json({ erro: 'Erro ao calcular risco por turno.' });
  }
});

// GET /api/respostas/evolucao — índice de risco dia a dia
router.get('/evolucao', async (req, res) => {
  try {
    const { match } = filtroPeriodo(req.query.periodo);

    const linhas = await Resposta.aggregate([
      { $match: match },
      {
        $group: {
          // O timezone é obrigatório aqui: sem ele o Mongo agrupa por dia em
          // UTC, e respostas do fim da tarde no Brasil cairiam no dia seguinte.
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$data_envio',
              timezone: config.FUSO_HORARIO,
            },
          },
          ...camposDeMedia(),
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const serie = linhas.map((l) => {
      const medias = {
        estresse: l.media_estresse,
        sono: l.media_sono,
        carga_trabalho: l.media_carga_trabalho,
        ambiente_fisico: l.media_ambiente_fisico,
      };
      return {
        dia: l._id,
        total: l.total,
        indiceRisco: Number(analise.calcularIndiceRisco(medias).toFixed(2)),
        media_estresse: Number(l.media_estresse.toFixed(2)),
        media_sono: Number(l.media_sono.toFixed(2)),
        media_carga_trabalho: Number(l.media_carga_trabalho.toFixed(2)),
        media_ambiente_fisico: Number(l.media_ambiente_fisico.toFixed(2)),
      };
    });

    res.json(serie);
  } catch (erro) {
    console.error('Erro ao calcular evolução:', erro.message);
    res.status(500).json({ erro: 'Erro ao calcular evolução.' });
  }
});

// GET /api/respostas/comentarios
//
// PROTEÇÃO DE ANONIMATO — ler antes de mexer:
// Esta é a rota mais delicada do sistema. Comentário é texto livre, e texto
// livre entrega quem escreveu com muito mais facilidade do que uma nota de 1 a
// 5. Três medidas se somam aqui:
//
//   1. Só aparecem comentários de setores com pelo menos
//      MINIMO_RESPOSTAS_COMENTARIO respostas no período. Um comentário sozinho
//      num setor pequeno é praticamente assinado.
//   2. O turno NÃO é devolvido. Setor + turno + noite estreita demais o grupo
//      de quem poderia ter escrito. Nos gráficos o turno continua, porque lá
//      ele vira média e não expõe ninguém.
//   3. Só a data, sem a hora. "22:14" combinado com a escala de trabalho
//      aponta para uma pessoa; "08/08" não.
//
// O que foi escondido é CONTADO e informado ao painel. Sumir com o dado em
// silêncio faria a gestão achar que ninguém comentou.
router.get('/comentarios', async (req, res) => {
  try {
    const { match } = filtroPeriodo(req.query.periodo);

    // Quantas respostas cada setor teve no período — é o que decide se os
    // comentários daquele setor podem ou não aparecer.
    const contagens = await Resposta.aggregate([
      { $match: match },
      { $group: { _id: '$setor', total: { $sum: 1 } } },
    ]);

    const minimo = config.MINIMO_RESPOSTAS_COMENTARIO;

    // Quais setores têm respostas suficientes para que seus comentários possam
    // aparecer. A separação é feita AQUI, e daí em diante vira filtro de banco:
    // a versão anterior buscava um lote de comentários e decidia na mão, dentro
    // do laço — o que fazia a contagem de ocultos parar no meio (ela só via o
    // que tinha vindo no lote, e o laço ainda interrompia ao juntar 20
    // visíveis). O painel chegava a anunciar "nenhum comentário oculto" com
    // comentários ocultos de verdade, que é exatamente o sumiço silencioso que
    // o comentário acima diz que não pode acontecer.
    const setoresPermitidos = [];
    for (const c of contagens) {
      if (c.total >= minimo) setoresPermitidos.push(c._id);
    }

    // O model já aplica trim ao salvar, então um comentário só de espaços
    // vira string vazia e é descartado por este filtro.
    const comComentario = { ...match, comentario: { $nin: [null, ''] } };

    // Visíveis e ocultos saem de duas consultas complementares sobre o mesmo
    // conjunto, então a soma sempre fecha, independente de quantos existam.
    // (Com setoresPermitidos vazio, $in não casa com nada e $nin casa com
    // tudo — ou seja, tudo oculto, que é o resultado correto.)
    const [linhas, ocultos] = await Promise.all([
      Resposta.find({ ...comComentario, setor: { $in: setoresPermitidos } })
        .sort({ data_envio: -1 })
        .limit(20)
        .lean(),
      Resposta.countDocuments({ ...comComentario, setor: { $nin: setoresPermitidos } }),
    ]);

    const dataSemHora = new Intl.DateTimeFormat('pt-BR', {
      timeZone: config.FUSO_HORARIO,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const visiveis = linhas.map((l) => {
      const medias = {
        estresse: l.estresse,
        sono: l.sono,
        carga_trabalho: l.carga_trabalho,
        ambiente_fisico: l.ambiente_fisico,
      };
      const indice = analise.calcularIndiceRisco(medias);

      return {
        id: l._id,
        setor: l.setor,
        setorNome: analise.nomeSetor(l.setor),
        comentario: l.comentario,
        data: dataSemHora.format(new Date(l.data_envio)),
        indiceRisco: Number(indice.toFixed(2)),
        classificacao: analise.classificarRisco(indice),
      };
    });

    res.json({ comentarios: visiveis, ocultos, minimo });
  } catch (erro) {
    console.error('Erro ao buscar comentários:', erro.message);
    res.status(500).json({ erro: 'Erro ao buscar comentários.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/respostas/exportar — CSV
//
// Dois detalhes pensados para o Excel brasileiro:
//   1. O arquivo começa com um BOM (\uFEFF). Sem ele o Excel ignora o UTF-8 e
//      "Produção" aparece como "ProduÃ§Ã£o".
//   2. O separador é ponto e vírgula, e os decimais usam vírgula — que é o
//      que o Excel em português espera.
// ---------------------------------------------------------------------------
function escaparCSV(valor) {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);

  // Proteção contra "CSV/formula injection": se o texto começa com =, +, -
  // ou @, o Excel abre a célula como fórmula em vez de texto. Como o
  // comentário vem de um formulário público sem login, alguém poderia
  // enviar algo como "=cmd|'/c calc'!A1" esperando que rodasse na máquina
  // de quem exportar. O apóstrofo força o Excel a tratar como texto puro,
  // sem mudar o valor visível na célula.
  // Tab e CR no início também fazem o Excel tratar a célula como fórmula.
  if (/^[=+\-@\t\r]/.test(texto)) {
    texto = `'${texto}`;
  }

  if (/[";\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Formata a data no padrão brasileiro, respeitando o fuso configurado. */
function dataBR(data) {
  return new Date(data).toLocaleString('pt-BR', { timeZone: config.FUSO_HORARIO });
}

/** Só o dia, sem hora — ver a regra de anonimato em /exportar. */
function dataSemHora(data) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.FUSO_HORARIO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(data));
}

/** Data de hoje (AAAA-MM-DD) no fuso do sistema, para nomes de arquivo. */
function dataDeHoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.FUSO_HORARIO }).format(new Date());
}

/**
 * Setores que têm respostas suficientes no período para que os comentários
 * apareçam. É a mesma regra de GET /comentarios, aplicada linha a linha aqui.
 */
async function setoresComComentarioLiberado(match) {
  const contagens = await Resposta.aggregate([
    { $match: match },
    { $group: { _id: '$setor', total: { $sum: 1 } } },
  ]);
  return new Set(
    contagens.filter((c) => c.total >= config.MINIMO_RESPOSTAS_COMENTARIO).map((c) => c._id)
  );
}

// GET /api/respostas/exportar — CSV com todas as respostas do período
//
// Regra de anonimato (a mesma de /comentarios): quando o comentário de uma
// resposta é liberado, o turno e a hora exata saem da linha, porque texto
// livre junto desses dados identifica quem escreveu. Respostas sem comentário,
// ou de setores pequenos, mantêm turno e hora.
router.get('/exportar', async (req, res) => {
  try {
    const { match } = filtroPeriodo(req.query.periodo);
    const [linhas, comentariosLiberados] = await Promise.all([
      Resposta.find(match).sort({ data_envio: -1 }).lean(),
      setoresComComentarioLiberado(match),
    ]);

    const cabecalho = [
      'ID', 'Setor', 'Turno', 'Estresse', 'Sono', 'Carga de trabalho',
      'Ambiente físico', 'Índice de risco', 'Nível', 'Comentário', 'Data de envio',
    ];

    const linhasCSV = linhas.map((l) => {
      const medias = {
        estresse: l.estresse,
        sono: l.sono,
        carga_trabalho: l.carga_trabalho,
        ambiente_fisico: l.ambiente_fisico,
      };
      const indice = analise.calcularIndiceRisco(medias);
      // Uma resposta antiga com algum indicador vazio não tem índice. Antes
      // isso lançava erro no toFixed e derrubava a exportação inteira.
      const temIndice = indice !== null;
      const mostraComentario = Boolean(l.comentario) && comentariosLiberados.has(l.setor);

      return [
        l._id,
        analise.nomeSetor(l.setor),
        mostraComentario ? '' : analise.nomeTurno(l.turno),
        l.estresse,
        l.sono,
        l.carga_trabalho,
        l.ambiente_fisico,
        temIndice ? indice.toFixed(2).replace('.', ',') : '',
        temIndice ? analise.classificarRisco(indice).rotulo : '',
        mostraComentario ? l.comentario : '',
        mostraComentario ? dataSemHora(l.data_envio) : dataBR(l.data_envio),
      ].map(escaparCSV).join(';');
    });

    const csv = '﻿' + [cabecalho.join(';'), ...linhasCSV].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="riscozero-${dataDeHoje()}.csv"`);
    res.send(csv);
  } catch (erro) {
    console.error('Erro ao exportar:', erro.message);
    res.status(500).json({ erro: 'Erro ao gerar o arquivo.' });
  }
});

// GET /api/respostas/exportar-pdf — relatório em PDF do mesmo período do painel
//
// Comentários não entram no PDF de propósito: ele circula por e-mail e pasta
// compartilhada, fora do controle que o painel tem sobre o anonimato.
router.get('/exportar-pdf', async (req, res) => {
  try {
    const resumo = await montarResumo(req.query.periodo);
    const pdf = await gerarPdfResumo(resumo);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="riscozero-${dataDeHoje()}.pdf"`);
    res.send(pdf);
  } catch (erro) {
    console.error('Erro ao gerar PDF:', erro.message);
    res.status(500).json({ erro: 'Erro ao gerar o PDF.' });
  }
});

module.exports = router;
