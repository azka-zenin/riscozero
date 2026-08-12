// resetar-senha.js
//
// Para quando o único admin esquece a própria senha e não há mais ninguém
// para editar a conta pela tela. Troca a senha direto no banco, usando o
// mesmo bcrypt do resto do sistema — não inventa um jeito novo de guardar
// senha, só entra pela porta dos fundos por não ter outra pessoa que abra a
// porta da frente.
//
// USO (uma vez, na pasta do projeto, com o .env já preenchido):
//
//   node resetar-senha.js seu@email.com NovaSenhaAqui
//
// Depois de rodar, TROQUE A SENHA DE NOVO pela tela (Usuários > Trocar minha
// senha) assim que conseguir entrar — este script só existe para destravar o
// acesso, não para ser o jeito normal de trocar senha no dia a dia.

require('dotenv').config();
const { conectar, desconectar } = require('./database');
const { Usuario } = require('./models/Usuario');

async function main() {
  const [, , email, novaSenha] = process.argv;

  if (!email || !novaSenha) {
    console.log('Uso: node resetar-senha.js seu@email.com NovaSenhaAqui');
    process.exit(1);
  }

  if (novaSenha.length < 6) {
    console.log('A senha precisa ter pelo menos 6 caracteres (mesma regra do cadastro normal).');
    process.exit(1);
  }

  await conectar();

  const usuario = await Usuario.findOne({ email: email.toLowerCase().trim() });

  if (!usuario) {
    console.log(`Nenhuma conta encontrada com o e-mail "${email}".`);
    await desconectar();
    process.exit(1);
  }

  await usuario.definirSenha(novaSenha);

  // Se a conta estava desativada, o reset de senha não a reativa sozinho —
  // são dois problemas diferentes. Só avisa, para não confundir.
  if (!usuario.ativo) {
    console.log('Aviso: esta conta está DESATIVADA. A senha foi trocada, mas o');
    console.log('login continuará bloqueado até reativar a conta.');
  }

  await usuario.save();
  await desconectar();

  console.log(`Senha de ${usuario.email} (${usuario.nome}) atualizada com sucesso.`);
  console.log('Entre no sistema e troque essa senha de novo pela tela assim que puder.');
}

main().catch((erro) => {
  console.error('Erro ao resetar senha:', erro.message);
  process.exit(1);
});
