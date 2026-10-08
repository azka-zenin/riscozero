// utils/reset-por-ambiente.js
//
// Destrava o acesso quando o único admin esquece a senha e não há como rodar
// resetar-senha.js (hospedagem sem shell, sem acesso de rede ao banco).
//
// COMO USAR: no painel da hospedagem, defina RESETAR_ADMIN_EMAIL e
// RESETAR_ADMIN_SENHA e reinicie o serviço. Na subida, a conta é criada ou tem
// a senha trocada e é reativada. DEPOIS DE ENTRAR, APAGUE AS DUAS VARIÁVEIS —
// enquanto existirem, a senha é regravada a cada reinício.
//
// Roda dentro do servidor, com a conexão que ele já tem: sem porta de entrada
// nova, sem rota HTTP, e a senha nunca vai para o log.

const { Usuario } = require('../models/Usuario');

async function resetarAdminPorAmbiente() {
  const email = (process.env.RESETAR_ADMIN_EMAIL || '').toLowerCase().trim();
  const senha = process.env.RESETAR_ADMIN_SENHA || '';

  if (!email && !senha) return;

  if (!email || senha.length < 6) {
    console.warn('  RESETAR_ADMIN_*: ignorado — informe o e-mail e uma senha de 6+ caracteres.');
    return;
  }

  let usuario = await Usuario.findOne({ email });
  const criada = !usuario;

  if (criada) {
    usuario = new Usuario({ nome: 'Administrador', email, papel: 'admin' });
  }

  await usuario.definirSenha(senha);
  usuario.ativo = true;
  await usuario.save();

  console.warn(
    `  RESETAR_ADMIN_*: conta ${email} ${criada ? 'criada' : 'com senha trocada e ativa'}. ` +
    'APAGUE essas variáveis de ambiente agora.'
  );
}

module.exports = { resetarAdminPorAmbiente };
