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

const { conectar, desconectar } = require('./database');
const { Resposta } = require('./models/Resposta');
const { Usuario } = require('./models/Usuario');

const apagarTudo = process.argv.includes('--tudo');

(async () => {
  try {
    await conectar();

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
