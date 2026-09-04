// routes/bi.js
// Exportação de dados para ferramentas de análise (Power BI, Looker, planilhas).
//
// Protegidas por chave de BI ou login de gestão (ver middleware/auth.js):
//   GET  /api/bi/completo    → uma linha por resposta
//   GET  /api/bi/agregado    → médias e índice por setor e por turno
//   GET  /api/bi/serie       → índice de risco dia a dia
//
// Só admin, com login normal (chave de BI não serve):
//   POST   /api/bi/chaves      → cria uma chave e mostra o valor UMA vez
//   GET    /api/bi/chaves      → lista as chaves, sem os valores
//   DELETE /api/bi/chaves/:id  → revoga uma chave
//
// POR QUE SEPARAR DE /api/respostas: aquelas rotas existem para desenhar o
// painel e devolvem tudo junto — alertas, recomendações, textos prontos. Uma
// ferramenta de BI quer o contrário: tabelas simples, uma linha por registro,
// que ela mesma cruza e agrupa. Misturar os dois formatos numa rota só
// deixaria as duas piores.
//
// O QUE NUNCA SAI DAQUI: o comentário em texto livre. Ele é o campo capaz de
// identificar quem respondeu, e a trava que o painel aplica
// (MINIMO_RESPOSTAS_COMENTARIO) depende de o painel decidir o que mostrar —
// numa exportação bruta, quem recebe o arquivo decide, e aí a promessa de
// anonimato feita a quem preencheu o formulário deixa de estar nas nossas mãos.

const express = require('express');
const router = express.Router();
const { Resposta } = require('../models/Resposta');
const { TokenBI } = require('../models/TokenBI');
const {
  exigirLogin, exigirAdmin, exigirAcessoBI, gerarTokenBI,
} = require('../middleware/auth');
const analise = require('../utils/analise');
const config = require('../config');

// Quantos dias uma chave nova vale, por padrão.
// 90 dias é longo o bastante para o relatório não quebrar no meio de um
// trimestre e curto o bastante para uma chave esquecida não valer para sempre.
const DIAS_VALIDADE_PADRAO = 90;
const DIAS_VALIDADE_MAXIMO = 365;

// Teto de linhas por página. Existe para uma exportação de anos de dados não
// tentar montar um JSON gigante em memória e derrubar o processo.
const LIMITE_PAGINA = 5000;

/**
 * Lê o intervalo de datas de ?de=&ate= (formato AAAA-MM-DD).
 * Sem parâmetro, devolve tudo — a ferramenta de BI é quem decide o recorte.
 */
function filtroDeDatas(query) {
  const filtro = {};
  const de = query.de ? new Date(`${query.de}T00:00:00`) : null;
  const ate = query.ate ? new Date(`${query.ate}T23:59:59.999`) : null;

  if (de && !Number.isNaN(de.getTime())) filtro.$gte = de;
  if (ate && !Number.isNaN(ate.getTime())) filtro.$lte = ate;

  return Object.keys(filtro).length > 0 ? { data_envio: filtro } : {};
}

function camposDeMedia() {
  return {
    total: { $sum: 1 },
    media_estresse: { $avg: '$estresse' },
    media_sono: { $avg: '$sono' },
    media_carga_trabalho: { $avg: '$carga_trabalho' },
    media_ambiente_fisico: { $avg: '$ambiente_fisico' },
  };
}

/** Acrescenta índice e classificação a um bloco de médias. */
function comIndice(medias) {
  const indice = analise.calcularIndiceRisco(medias);
  return {
    indiceRisco: Number(indice.toFixed(2)),
    nivel: analise.classificarRisco(indice).nivel,
  };
}

// ---------------------------------------------------------------------------
// Exportações
// ---------------------------------------------------------------------------

// GET /api/bi/completo — uma linha por resposta
router.get('/completo', exigirAcessoBI, async (req, res) => {
  try {
    const filtro = filtroDeDatas(req.query);
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const porPagina = Math.min(LIMITE_PAGINA, Math.max(1, Number(req.query.limite) || LIMITE_PAGINA));

    const [total, linhas] = await Promise.all([
      Resposta.countDocuments(filtro),
      Resposta.find(filtro)
        .sort({ data_envio: 1 })
        .skip((pagina - 1) * porPagina)
        .limit(porPagina)
        .lean(),
    ]);

    res.json({
      total,
      pagina,
      porPagina,
      // Quem consome só precisa saber se há mais uma página para buscar; não
      // deve ter que refazer a conta de total/porPagina do lado dele.
      temMais: pagina * porPagina < total,
      dados: linhas.map((l) => {
        const medias = {
          estresse: l.estresse,
          sono: l.sono,
          carga_trabalho: l.carga_trabalho,
          ambiente_fisico: l.ambiente_fisico,
        };
        return {
          id: String(l._id),
          setor: l.setor,
          setorNome: analise.nomeSetor(l.setor),
          turno: l.turno,
          turnoNome: analise.nomeTurno(l.turno),
          estresse: l.estresse,
          sono: l.sono,
          carga_trabalho: l.carga_trabalho,
          ambiente_fisico: l.ambiente_fisico,
          ...comIndice(medias),
          dataEnvio: l.data_envio,
        };
      }),
    });
  } catch (erro) {
    console.error('Erro na exportação completa:', erro.message);
    res.status(500).json({ erro: 'Erro ao exportar os dados.' });
  }
});

// GET /api/bi/agregado — médias por setor e por turno
router.get('/agregado', exigirAcessoBI, async (req, res) => {
  try {
    const filtro = filtroDeDatas(req.query);

    const [porSetor, porTurno] = await Promise.all([
      Resposta.aggregate([
        { $match: filtro },
        { $group: { _id: '$setor', ...camposDeMedia() } },
        { $sort: { _id: 1 } },
      ]),
      Resposta.aggregate([
        { $match: filtro },
        { $group: { _id: '$turno', ...camposDeMedia() } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const formatar = (lista, chave, nomear) => lista.map((l) => {
      const medias = {
        estresse: l.media_estresse,
        sono: l.media_sono,
        carga_trabalho: l.media_carga_trabalho,
        ambiente_fisico: l.media_ambiente_fisico,
      };
      return {
        [chave]: l._id,
        [`${chave}Nome`]: nomear(l._id),
        total: l.total,
        media_estresse: l.media_estresse,
        media_sono: l.media_sono,
        media_carga_trabalho: l.media_carga_trabalho,
        media_ambiente_fisico: l.media_ambiente_fisico,
        ...comIndice(medias),
      };
    });

    res.json({
      porSetor: formatar(porSetor, 'setor', analise.nomeSetor),
      porTurno: formatar(porTurno, 'turno', analise.nomeTurno),
    });
  } catch (erro) {
    console.error('Erro na exportação agregada:', erro.message);
    res.status(500).json({ erro: 'Erro ao exportar os dados.' });
  }
});

// GET /api/bi/serie — índice dia a dia, opcionalmente separado por setor
router.get('/serie', exigirAcessoBI, async (req, res) => {
  try {
    const filtro = filtroDeDatas(req.query);
    const separarPorSetor = req.query.porSetor === 'true';

    const dia = {
      $dateToString: {
        format: '%Y-%m-%d',
        date: '$data_envio',
        // Sem o fuso, uma resposta das 22h de Brasília cairia no dia seguinte
        // e o gráfico do Power BI mostraria picos em datas erradas.
        timezone: config.FUSO_HORARIO,
      },
    };

    const linhas = await Resposta.aggregate([
      { $match: filtro },
      { $group: { _id: separarPorSetor ? { dia, setor: '$setor' } : { dia }, ...camposDeMedia() } },
      { $sort: { '_id.dia': 1, '_id.setor': 1 } },
    ]);

    res.json({
      granularidade: 'dia',
      separadoPorSetor: separarPorSetor,
      dados: linhas.map((l) => {
        const medias = {
          estresse: l.media_estresse,
          sono: l.media_sono,
          carga_trabalho: l.media_carga_trabalho,
          ambiente_fisico: l.media_ambiente_fisico,
        };
        const linha = {
          dia: l._id.dia,
          total: l.total,
          media_estresse: l.media_estresse,
          media_sono: l.media_sono,
          media_carga_trabalho: l.media_carga_trabalho,
          media_ambiente_fisico: l.media_ambiente_fisico,
          ...comIndice(medias),
        };
        if (separarPorSetor) {
          linha.setor = l._id.setor;
          linha.setorNome = analise.nomeSetor(l._id.setor);
        }
        return linha;
      }),
    });
  } catch (erro) {
    console.error('Erro na exportação da série:', erro.message);
    res.status(500).json({ erro: 'Erro ao exportar os dados.' });
  }
});

// ---------------------------------------------------------------------------
// Gerência das chaves — só admin, e só com login normal
//
// A chave de BI não serve aqui de propósito: se uma chave vazada pudesse
// criar outras chaves, revogá-la não resolveria nada.
// ---------------------------------------------------------------------------

router.post('/chaves', exigirLogin, exigirAdmin, async (req, res) => {
  const nome = req.body?.nome ? String(req.body.nome).trim() : '';
  if (!nome) {
    return res.status(400).json({ erro: 'Dê um nome à chave, para saber depois de quem ela é.' });
  }

  const dias = Number(req.body?.dias) || DIAS_VALIDADE_PADRAO;
  if (dias < 1 || dias > DIAS_VALIDADE_MAXIMO) {
    return res.status(400).json({ erro: `A validade precisa ficar entre 1 e ${DIAS_VALIDADE_MAXIMO} dias.` });
  }

  try {
    const { bruto, hash, prefixo } = gerarTokenBI();
    const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

    const registro = await TokenBI.create({
      nome, hash, prefixo, expiraEm,
      criadoPor: req.usuario.email,
    });

    res.status(201).json({
      id: registro._id,
      nome: registro.nome,
      prefixo: registro.prefixo,
      expiraEm: registro.expiraEm,

      // Única vez que o valor aparece. Não fica guardado em lugar nenhum —
      // só o hash vai para o banco.
      chave: bruto,
      aviso: 'Guarde esta chave agora. Ela não será mostrada de novo.',
    });
  } catch (erro) {
    console.error('Erro ao criar chave de BI:', erro.message);
    res.status(500).json({ erro: 'Erro ao criar a chave.' });
  }
});

router.get('/chaves', exigirLogin, exigirAdmin, async (req, res) => {
  try {
    const chaves = await TokenBI.find().sort({ criadoEm: -1 }).lean();
    const agora = new Date();

    res.json(chaves.map((c) => ({
      id: String(c._id),
      nome: c.nome,
      prefixo: c.prefixo,
      criadoPor: c.criadoPor,
      criadoEm: c.criadoEm,
      expiraEm: c.expiraEm,
      ultimoUso: c.ultimoUso,
      revogadaEm: c.revogadaEm,
      // Um só campo de estado poupa quem lê de comparar datas na tela.
      situacao: c.revogadaEm ? 'revogada'
        : new Date(c.expiraEm) <= agora ? 'expirada'
          : 'ativa',
    })));
  } catch (erro) {
    console.error('Erro ao listar chaves de BI:', erro.message);
    res.status(500).json({ erro: 'Erro ao listar as chaves.' });
  }
});

router.delete('/chaves/:id', exigirLogin, exigirAdmin, async (req, res) => {
  try {
    const registro = await TokenBI.findById(req.params.id);
    if (!registro) {
      return res.status(404).json({ erro: 'Chave não encontrada.' });
    }
    if (registro.revogadaEm) {
      return res.json({ mensagem: 'Esta chave já estava revogada.' });
    }

    registro.revogadaEm = new Date();
    await registro.save();
    res.json({ mensagem: 'Chave revogada. Ela para de funcionar a partir de agora.' });
  } catch (erro) {
    console.error('Erro ao revogar chave de BI:', erro.message);
    res.status(500).json({ erro: 'Erro ao revogar a chave.' });
  }
});

module.exports = router;
