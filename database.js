// database.js
// Conexão com o MongoDB usando Mongoose.
//
// POR QUE MONGOOSE E NÃO O DRIVER DIRETO DO MONGO:
// O Mongo aceita salvar qualquer coisa em qualquer formato — o que é flexível,
// mas perigoso: um erro de digitação criaria um campo novo em vez de dar erro.
// O Mongoose permite declarar o formato esperado de cada documento (ver a pasta
// models/) e recusa o que não encaixa. Ganhamos a validação que o SQL dava
// automaticamente com suas colunas fixas.

const mongoose = require('mongoose');

/**
 * Abre a conexão com o banco.
 * O servidor só deve começar a aceitar requisições depois que isto resolver —
 * senão as primeiras chamadas chegariam antes do banco estar pronto.
 */
async function conectar(uri) {
  const endereco = uri || process.env.MONGODB_URI;

  if (!endereco) {
    throw new Error(
      'MONGODB_URI não definida.\n' +
      'Copie o arquivo .env.example para .env e preencha o endereço do banco.\n' +
      'Comando: cp .env.example .env'
    );
  }

  // Se a conexão cair depois de estabelecida, o Mongoose tenta reconectar
  // sozinho. Estes eventos deixam isso visível no terminal em vez de o
  // sistema simplesmente parar de responder sem explicação.
  mongoose.connection.on('error', (erro) => {
    console.error('Erro na conexão com o MongoDB:', erro.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('Conexão com o MongoDB foi perdida. Tentando reconectar...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('Conexão com o MongoDB restabelecida.');
  });

  await conectarComRetentativa(endereco);

  const nomeDoBanco = mongoose.connection.name;
  console.log(`Conectado ao MongoDB (banco: ${nomeDoBanco})`);

  return mongoose.connection;
}

// Só a conexão INICIAL passa por aqui. Uma vez estabelecida, quem cuida de
// reconectar depois de uma queda é o próprio Mongoose (os listeners de
// 'disconnected'/'reconnected' acima só deixam isso visível no terminal).
//
// POR QUE ISTO IMPORTA: sem retentativa, uma falha passageira de rede bem no
// instante de subir o servidor derruba o processo inteiro (server.js sai com
// process.exit(1)) — e no plano gratuito do Render isso significa reiniciar
// manualmente pelo painel deles, possivelmente no meio de uma apresentação.
const TENTATIVAS_CONEXAO = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 3000;

async function conectarComRetentativa(endereco) {
  for (let tentativa = 1; tentativa <= TENTATIVAS_CONEXAO; tentativa++) {
    try {
      await mongoose.connect(endereco, {
        // Se o banco não responder em 10s, falha com mensagem clara em vez de
        // deixar a requisição pendurada até o navegador desistir.
        serverSelectionTimeoutMS: 10000,
      });
      return;
    } catch (erro) {
      const ultimaTentativa = tentativa === TENTATIVAS_CONEXAO;
      console.error(
        `Falha ao conectar no MongoDB (tentativa ${tentativa}/${TENTATIVAS_CONEXAO}): ${erro.message}`
      );
      if (ultimaTentativa) throw erro;
      console.log(`Tentando de novo em ${ESPERA_ENTRE_TENTATIVAS_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, ESPERA_ENTRE_TENTATIVAS_MS));
    }
  }
}

/** Fecha a conexão. Usado pelos scripts de seed e limpeza para o processo terminar. */
async function desconectar() {
  await mongoose.connection.close();
}

module.exports = { conectar, desconectar, mongoose };
