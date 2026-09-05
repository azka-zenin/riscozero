// routes/auth.js
// Entrada e saída do painel de gestão.

const express = require('express');
const router = express.Router();
const { Usuario } = require('../models/Usuario');
const { registrar } = require('../models/LogAcesso');
const { gerarToken, exigirLogin } = require('../middleware/auth');
const { limiteLogin, limiteLoginPorIP, limiteTrocarSenha } = require('../middleware/limites');

/** Descobre de onde veio a requisição, para o registro de acesso. */
function origemDa(req) {
  // req.ip, não o cabeçalho lido na mão: ver middleware/limites.js para o
  // motivo (o valor manual é forjável pelo próprio cliente).
  return req.ip || null;
}

// POST /api/auth/login  { email, senha }
router.post('/login', limiteLoginPorIP, limiteLogin, async (req, res) => {
  const { email, senha } = req.body;
  const origem = origemDa(req);
  // Corta em 254 (o limite de endereço da RFC 5321) em vez de recusar: o que
  // chega aqui numa tentativa que falhou é texto livre de quem tentou entrar,
  // e o registro de acesso NÃO pode ser perdido justamente quando alguém manda
  // algo fora do padrão — é essa tentativa que a auditoria mais precisa ver.
  const emailLimpo = email ? String(email).toLowerCase().trim().slice(0, 254) : '';

  try {
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe e-mail e senha.' });
    }

    const usuario = await Usuario.findOne({ email: emailLimpo }).select('+senhaHash');

    // Mesma mensagem para e-mail inexistente e senha errada, de propósito.
    // Se disséssemos "e-mail não encontrado", alguém poderia usar o login para
    // descobrir quais e-mails têm conta no sistema.
    const mensagemGenerica = 'E-mail ou senha incorretos.';

    if (!usuario) {
      await registrar({ email: emailLimpo, sucesso: false, motivo: 'usuario_inexistente', origem });
      return res.status(401).json({ erro: mensagemGenerica });
    }

    if (!usuario.ativo) {
      await registrar({
        email: emailLimpo, nome: usuario.nome,
        sucesso: false, motivo: 'conta_desativada', origem,
      });
      return res.status(403).json({ erro: 'Esta conta está desativada. Procure um administrador.' });
    }

    const confere = await usuario.senhaConfere(senha);
    if (!confere) {
      await registrar({
        email: emailLimpo, nome: usuario.nome,
        sucesso: false, motivo: 'senha_incorreta', origem,
      });
      return res.status(401).json({ erro: mensagemGenerica });
    }

    usuario.ultimoAcesso = new Date();
    await usuario.save();

    await registrar({
      email: emailLimpo, nome: usuario.nome,
      sucesso: true, motivo: 'ok', origem,
    });

    res.json({
      token: gerarToken(usuario),
      usuario: usuario.paraJSON(),
      mensagem: 'Acesso liberado.',
    });
  } catch (erro) {
    console.error('Erro no login:', erro.message);
    res.status(500).json({ erro: 'Erro ao processar o login.' });
  }
});

// POST /api/auth/logout
//
// Com JWT o servidor não guarda sessões, então não há o que apagar aqui — quem
// descarta o token é o navegador. A rota existe para o front ter um lugar único
// para chamar ao sair.
router.post('/logout', exigirLogin, (req, res) => {
  res.json({ mensagem: 'Sessão encerrada.' });
});

// POST /api/auth/trocar-senha  { senhaAtual, senhaNova }
//
// Troca da própria senha, sem precisar de administrador. Exige a senha atual
// para que alguém que encontre um computador destravado não consiga assumir a
// conta trocando a senha.
router.post('/trocar-senha', exigirLogin, limiteTrocarSenha, async (req, res) => {
  try {
    const { senhaAtual, senhaNova } = req.body;

    if (!senhaAtual || !senhaNova) {
      return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
    }

    const usuario = await Usuario.findById(req.usuario._id).select('+senhaHash');
    const confere = await usuario.senhaConfere(senhaAtual);

    if (!confere) {
      return res.status(401).json({ erro: 'A senha atual está incorreta.' });
    }

    if (senhaAtual === senhaNova) {
      return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' });
    }

    await usuario.definirSenha(senhaNova);
    await usuario.save();

    res.json({ mensagem: 'Senha alterada com sucesso.' });
  } catch (erro) {
    if (erro.message && erro.message.includes('6 caracteres')) {
      return res.status(400).json({ erro: erro.message });
    }
    console.error('Erro ao trocar senha:', erro.message);
    res.status(500).json({ erro: 'Erro ao trocar a senha.' });
  }
});

// GET /api/auth/eu — quem está logado (o painel usa para exibir o nome)
router.get('/eu', exigirLogin, (req, res) => {
  res.json(req.usuario.paraJSON());
});

// GET /api/auth/verificar — o front usa para saber se o token ainda vale
router.get('/verificar', exigirLogin, (req, res) => {
  res.json({ valido: true, usuario: req.usuario.paraJSON() });
});

module.exports = router;
