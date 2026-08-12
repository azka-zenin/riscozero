// routes/logs.js
// Consulta do histórico de acessos ao painel.
//
//   GET /api/logs           → lista os acessos (só admin)
//   GET /api/logs/resumo    → números gerais e sinais de alerta (só admin)
//
// Restrito a administradores: saber quem entrou e quando é informação de
// segurança, não algo que todo gestor precise ver.

const express = require('express');
const router = express.Router();
const { LogAcesso } = require('../models/LogAcesso');
const { exigirLogin, exigirAdmin } = require('../middleware/auth');

router.use(exigirLogin, exigirAdmin);

// Descrições em português para exibir na tela
const MOTIVOS = {
  ok: 'Entrou',
  senha_incorreta: 'Senha incorreta',
  usuario_inexistente: 'Conta não existe',
  conta_desativada: 'Conta desativada',
};

/** Monta o filtro a partir dos parâmetros da consulta. */
function montarFiltro(query) {
  const filtro = {};

  if (query.apenas === 'falhas') filtro.sucesso = false;
  if (query.apenas === 'sucessos') filtro.sucesso = true;

  const dias = Number(query.periodo);
  if (!Number.isNaN(dias) && dias > 0) {
    const corte = new Date();
    corte.setDate(corte.getDate() - (dias - 1));
    corte.setHours(0, 0, 0, 0);
    filtro.data = { $gte: corte };
  }

  return filtro;
}

// GET /api/logs
router.get('/', async (req, res) => {
  try {
    const filtro = montarFiltro(req.query);

    // Limite fixo: o histórico cresce sem parar, e carregar tudo de uma vez
    // deixaria a tela lenta depois de alguns meses de uso.
    const limite = Math.min(Number(req.query.limite) || 100, 500);

    const registros = await LogAcesso.find(filtro)
      .sort({ data: -1 })
      .limit(limite)
      .lean();

    res.json(registros.map((r) => ({
      id: r._id,
      email: r.email,
      nome: r.nome,
      sucesso: r.sucesso,
      motivo: r.motivo,
      motivoTexto: MOTIVOS[r.motivo] || r.motivo,
      origem: r.origem,
      data: r.data,
    })));
  } catch (erro) {
    console.error('Erro ao buscar o histórico:', erro.message);
    res.status(500).json({ erro: 'Erro ao buscar o histórico de acessos.' });
  }
});

// GET /api/logs/resumo
router.get('/resumo', async (req, res) => {
  try {
    const filtro = montarFiltro(req.query);

    const [totais, porMotivo, suspeitos] = await Promise.all([
      LogAcesso.aggregate([
        { $match: filtro },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            // $cond escolhe 1 ou 0 conforme a condição, então somar dá a
            // contagem de cada tipo numa passagem só pelos dados.
            sucessos: { $sum: { $cond: ['$sucesso', 1, 0] } },
            falhas: { $sum: { $cond: ['$sucesso', 0, 1] } },
            ultimo: { $max: '$data' },
          },
        },
      ]),

      LogAcesso.aggregate([
        { $match: filtro },
        { $group: { _id: '$motivo', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      // Contas com muitas falhas seguidas: é o padrão de alguém tentando
      // adivinhar uma senha. Três ou mais já merece um olhar.
      LogAcesso.aggregate([
        { $match: { ...filtro, sucesso: false } },
        { $group: { _id: '$email', falhas: { $sum: 1 }, ultima: { $max: '$data' } } },
        { $match: { falhas: { $gte: 3 } } },
        { $sort: { falhas: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const geral = totais[0] || { total: 0, sucessos: 0, falhas: 0, ultimo: null };

    res.json({
      geral,
      porMotivo: porMotivo.map((m) => ({
        motivo: m._id,
        motivoTexto: MOTIVOS[m._id] || m._id,
        total: m.total,
      })),
      suspeitos: suspeitos.map((s) => ({
        email: s._id,
        falhas: s.falhas,
        ultima: s.ultima,
      })),
    });
  } catch (erro) {
    console.error('Erro ao resumir o histórico:', erro.message);
    res.status(500).json({ erro: 'Erro ao resumir o histórico de acessos.' });
  }
});

module.exports = router;
