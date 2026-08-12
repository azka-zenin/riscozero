// routes/usuarios.js
// CRUD das contas de gestão.
//
//   POST   /api/usuarios      → cria uma conta          (Create)
//   GET    /api/usuarios      → lista as contas          (Read)
//   GET    /api/usuarios/:id  → detalha uma conta        (Read)
//   PUT    /api/usuarios/:id  → atualiza uma conta       (Update)
//   DELETE /api/usuarios/:id  → remove uma conta         (Delete)
//
// Todas exigem login, e as que alteram dados exigem papel de administrador.

const express = require('express');
const router = express.Router();
const { Usuario } = require('../models/Usuario');
const { exigirLogin, exigirAdmin } = require('../middleware/auth');

// Toda rota daqui exige estar logado
router.use(exigirLogin);

/**
 * Traduz os erros do Mongoose para mensagens que fazem sentido para quem usa.
 * O erro 11000 do Mongo significa "valor duplicado em campo único" — aqui só
 * pode ser o e-mail, já que é o único campo com essa restrição.
 */
function tratarErro(erro, res, acao) {
  if (erro.name === 'ValidationError') {
    const primeira = Object.values(erro.errors)[0];
    return res.status(400).json({ erro: primeira.message });
  }
  if (erro.code === 11000) {
    return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });
  }
  if (erro.name === 'CastError') {
    return res.status(400).json({ erro: 'Identificador de usuário inválido.' });
  }
  if (erro.message && erro.message.includes('6 caracteres')) {
    return res.status(400).json({ erro: erro.message });
  }
  console.error(`Erro ao ${acao}:`, erro.message);
  return res.status(500).json({ erro: `Erro ao ${acao}.` });
}

// ---------------------------------------------------------------------------
// CREATE — POST /api/usuarios
// ---------------------------------------------------------------------------
router.post('/', exigirAdmin, async (req, res) => {
  try {
    const { nome, email, senha, papel } = req.body;

    if (!senha) {
      return res.status(400).json({ erro: 'Informe uma senha para a nova conta.' });
    }

    const usuario = new Usuario({ nome, email, papel });
    await usuario.definirSenha(senha); // converte para hash antes de gravar
    await usuario.save();

    res.status(201).json({
      mensagem: 'Conta criada com sucesso.',
      usuario: usuario.paraJSON(),
    });
  } catch (erro) {
    tratarErro(erro, res, 'criar a conta');
  }
});

// ---------------------------------------------------------------------------
// READ — GET /api/usuarios
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    // O campo senhaHash já está oculto por padrão no model, então não há
    // risco de ele escapar nesta listagem.
    const usuarios = await Usuario.find().sort({ nome: 1 });
    res.json(usuarios.map((u) => u.paraJSON()));
  } catch (erro) {
    tratarErro(erro, res, 'listar as contas');
  }
});

// READ — GET /api/usuarios/:id
router.get('/:id', async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ erro: 'Conta não encontrada.' });
    }
    res.json(usuario.paraJSON());
  } catch (erro) {
    tratarErro(erro, res, 'buscar a conta');
  }
});

// ---------------------------------------------------------------------------
// UPDATE — PUT /api/usuarios/:id
// ---------------------------------------------------------------------------
router.put('/:id', exigirAdmin, async (req, res) => {
  try {
    const { nome, email, senha, papel, ativo } = req.body;

    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ erro: 'Conta não encontrada.' });
    }

    // Trava de segurança: um administrador não pode rebaixar ou desativar a
    // própria conta. Sem isso, seria possível o único admin se remover por
    // engano e o sistema ficar sem ninguém capaz de gerenciar contas.
    const alterandoSiMesmo = usuario._id.equals(req.usuario._id);
    if (alterandoSiMesmo) {
      if (papel && papel !== usuario.papel) {
        return res.status(400).json({ erro: 'Você não pode alterar o próprio papel.' });
      }
      if (ativo === false) {
        return res.status(400).json({ erro: 'Você não pode desativar a própria conta.' });
      }
    }

    if (nome !== undefined) usuario.nome = nome;
    if (email !== undefined) usuario.email = email;
    if (papel !== undefined) usuario.papel = papel;
    if (ativo !== undefined) usuario.ativo = ativo;
    if (senha) await usuario.definirSenha(senha);

    await usuario.save();

    res.json({
      mensagem: 'Conta atualizada com sucesso.',
      usuario: usuario.paraJSON(),
    });
  } catch (erro) {
    tratarErro(erro, res, 'atualizar a conta');
  }
});

// ---------------------------------------------------------------------------
// DELETE — DELETE /api/usuarios/:id
// ---------------------------------------------------------------------------
router.delete('/:id', exigirAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ erro: 'Conta não encontrada.' });
    }

    if (usuario._id.equals(req.usuario._id)) {
      return res.status(400).json({ erro: 'Você não pode remover a própria conta.' });
    }

    // Impede que o sistema fique sem nenhum administrador ativo — nesse caso
    // ninguém conseguiria criar contas, e a única saída seria mexer no banco.
    //
    // Só bloqueamos se a conta a remover for de um admin ATIVO. Um admin já
    // desativado não conta para esse total: ele não consegue entrar, então
    // removê-lo não tira acesso de ninguém. Sem essa distinção, uma conta
    // desativada de administrador ficaria presa no sistema para sempre.
    if (usuario.papel === 'admin' && usuario.ativo) {
      const outrosAdminsAtivos = await Usuario.countDocuments({
        papel: 'admin',
        ativo: true,
        _id: { $ne: usuario._id },
      });
      if (outrosAdminsAtivos === 0) {
        return res.status(400).json({
          erro: 'Não é possível remover o último administrador ativo do sistema.',
        });
      }
    }

    await usuario.deleteOne();

    res.json({ mensagem: 'Conta removida com sucesso.' });
  } catch (erro) {
    tratarErro(erro, res, 'remover a conta');
  }
});

module.exports = router;
