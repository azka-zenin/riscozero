// limpar.js
// Apaga as respostas do banco.
//
//   npm run limpar            → apaga só as respostas (mantém os usuários)
//   npm run limpar -- --tudo  → apaga respostas E usuários
//
// O uso normal é antes de uma apresentação em que vocês queiram coletar
// respostas ao vivo da plateia, começando com o painel zerado.
//
// Os usuários são preservados por padrão de propósito: apagá-los deixaria
// vocês sem conseguir entrar no painel até rodar o seed de novo.

require('dotenv').config();

const readline = require('node:readline');
const { conectar, desconectar } = require('./database');
const { Resposta } = require('./models/Resposta');
const { Usuario } = require('./models/Usuario');

const apagarTudo = process.argv.includes('--tudo');

/**
 * Pede para digitar "apagar" antes de seguir.
 *
 * POR QUE ISTO EXISTE: este script é feito para ser rodado ao vivo, entre
 * demonstrações, com o banco de verdade — exatamente a situação em que um
 * terminal errado ou um .env apontando para o Atlas errado apaga dado real
 * sem chance de desfazer. Uma confirmação de um segundo custa muito pouco
 * perto do risco.
 */
function confirmar(pergunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(pergunta, (resposta) => {
      rl.close();
      resolve(resposta.trim().toLowerCase() === 'apagar');
    });
  });
}

(async () => {
  try {
    await conectar();

    const totalRespostas = await Resposta.countDocuments();
    const totalUsuarios = apagarTudo ? await Usuario.countDocuments() : 0;

    console.log('');
    console.log('Isto vai apagar:');
    console.log(`  ${totalRespostas} resposta(s)`);
    if (apagarTudo) console.log(`  ${totalUsuarios} usuário(s) (incluindo administradores)`);
    console.log('');

    const confirmou = await confirmar('Digite "apagar" para confirmar: ');
    if (!confirmou) {
      console.log('Cancelado. Nada foi apagado.');
      await desconectar();
      process.exit(0);
    }

    const respostas = await Resposta.deleteMany({});
    console.log(`${respostas.deletedCount} resposta(s) removida(s).`);

    if (apagarTudo) {
      const usuarios = await Usuario.deleteMany({});
      console.log(`${usuarios.deletedCount} usuário(s) removido(s).`);
      console.log('Rode "npm run seed" para recriar o administrador antes de entrar no painel.');
    } else {
      console.log('Usuários preservados. Use --tudo para apagá-los também.');
    }

    await desconectar();
    process.exit(0);
  } catch (erro) {
    console.error('Erro ao limpar o banco:', erro.message);
    process.exit(1);
  }
})();
