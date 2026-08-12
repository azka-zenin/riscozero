// server.js
// Ponto de entrada do sistema.
//
// Diferença importante em relação à versão com SQLite: o servidor só começa a
// aceitar requisições DEPOIS que a conexão com o MongoDB estiver pronta. Com um
// banco em arquivo isso era instantâneo; com um banco na nuvem, subir o servidor
// antes da conexão faria as primeiras chamadas falharem sem explicação clara.

require('dotenv').config();

const express = require('express');
const path = require('path');
const config = require('./config');
const { conectar, mongoose } = require('./database');
const { seguranca } = require('./middleware/seguranca');

const respostasRouter = require('./routes/respostas');
const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const logsRouter = require('./routes/logs');

const app = express();

// Quando o sistema roda publicado, as requisições chegam através de um
// intermediário da hospedagem. Sem esta linha, o Express veria o endereço do
// intermediário em vez do de quem realmente acessou — e o histórico de acessos
// registraria sempre o mesmo IP para todo mundo.
app.set('trust proxy', 1);

app.use(express.json());

// Cabeçalhos de segurança em toda resposta, inclusive nos arquivos estáticos —
// por isso vem antes do express.static.
app.use(seguranca);

app.use(express.static(path.join(__dirname, 'public')));

// Verificação de saúde. Serviços de hospedagem chamam um endereço assim de
// tempos em tempos para saber se a aplicação continua de pé. Fica antes das
// rotas protegidas de propósito: precisa responder sem login.
app.get('/api/saude', (req, res) => {
  const conectado = mongoose.connection.readyState === 1;
  res.status(conectado ? 200 : 503).json({
    ok: conectado,
    banco: conectado ? 'conectado' : 'sem conexão',
    versao: require('./package.json').version,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/logs', logsRouter);
app.use('/api/respostas', respostasRouter);

// Rota de API inexistente devolve JSON, não a página HTML padrão do Express.
// Sem isso, um erro de digitação na URL quebraria o JSON.parse() no navegador
// com uma mensagem confusa de "token < inesperado".
app.use('/api', (req, res) => {
  res.status(404).json({ erro: 'Rota da API não encontrada.' });
});

// Captura qualquer erro não tratado nas rotas, para o servidor nunca cair
// silenciosamente no meio de uma apresentação.
app.use((erro, req, res, next) => {
  console.error('Erro não tratado:', erro);
  if (res.headersSent) return next(erro);
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

async function iniciar() {
  try {
    await conectar();

    app.listen(config.PORTA, () => {
      // Publicado, o endereço é o do serviço de hospedagem, não localhost.
      const publicado = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
      const base = publicado || `http://localhost:${config.PORTA}`;

      console.log('');
      console.log('  RiscoZero no ar');
      console.log(`  Formulário: ${base}`);
      console.log(`  Painel:     ${base}/login.html`);
      if (!publicado) console.log('');
      else console.log(`  (rodando na porta ${config.PORTA})\n`);
    });
  } catch (erro) {
    console.error('');
    console.error('  Não foi possível iniciar o RiscoZero.');
    console.error('  ' + erro.message);
    console.error('');
    process.exit(1);
  }
}

iniciar();

module.exports = app; // exportado para os testes automatizados
