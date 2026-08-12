// server.js
// Ponto de entrada do sistema.
//
// Diferença importante em relação à versão com SQLite: o servidor só começa a
// aceitar requisições DEPOIS que a conexão com o MongoDB estiver pronta. Com um
// banco em arquivo isso era instantâneo; com um banco na nuvem, subir o servidor
// antes da conexão faria as primeiras chamadas falharem sem explicação clara.

require('dotenv').config();

const express = require('express');
const compression = require('compression');
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

// Comprime toda resposta antes de enviar — o arquivo do Chart.js sozinho tem
// mais de 200KB, e numa wifi de escola isso é diferença real de tempo de
// carregamento. Cedo na cadeia, de propósito: cobre tanto os arquivos
// estáticos quanto as respostas JSON da API.
app.use(compression());

// Cabeçalhos de segurança em toda resposta, inclusive nos arquivos estáticos —
// por isso vem antes do express.static.
app.use(seguranca);

// maxAge curto (1h), não um valor grande: os nomes de arquivo aqui não mudam
// quando o conteúdo muda (não há um hash tipo style.abc123.css), então um
// cache longo faria alguém continuar vendo a versão antiga por bastante
// tempo depois de um push de última hora — justamente o tipo de ajuste que
// este time faz nos dias antes de apresentar. Uma hora já evita rebuscar
// fonte/CSS/JS a cada clique dentro da mesma sessão de demonstração, sem
// esse risco.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

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

// Qualquer outro endereço que não bateu com um arquivo estático nem com uma
// rota de API cai aqui. Sem isto, um link ou digitação errada mostraria a
// página padrão do Express ("Cannot GET ...") — sem nenhuma cara do sistema,
// bem na frente da banca se acontecer durante a apresentação.
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
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

    const servidor = app.listen(config.PORTA, () => {
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

    configurarEncerramentoGracioso(servidor);
  } catch (erro) {
    console.error('');
    console.error('  Não foi possível iniciar o RiscoZero.');
    console.error('  ' + erro.message);
    console.error('');
    process.exit(1);
  }
}

// Toda publicação (Render incluído, ver PUBLICAR.md) redeploya a cada push
// pro branch principal, derrubando o processo anterior. Sem isto, um push de
// última hora — inclusive minutos antes de apresentar — interrompia
// requisições em andamento no meio da resposta. Com o handler, o servidor
// para de aceitar conexão NOVA, deixa a que já estava em andamento terminar
// (até um limite de tempo, para não travar o desligamento para sempre) e só
// depois fecha a conexão com o banco e sai.
function configurarEncerramentoGracioso(servidor) {
  const TEMPO_LIMITE_MS = 10000;
  let encerrando = false;

  async function encerrar(sinal) {
    if (encerrando) return; // Ctrl+C duas vezes seguidas não deve travar em loop
    encerrando = true;

    console.log(`\n  Sinal ${sinal} recebido — encerrando o RiscoZero...`);

    const tempoLimite = setTimeout(() => {
      console.warn('  Tempo esgotado esperando as requisições em andamento; forçando saída.');
      process.exit(1);
    }, TEMPO_LIMITE_MS);
    tempoLimite.unref(); // não impede o processo de sair mais cedo, se tudo fechar antes

    servidor.close(async () => {
      try {
        await mongoose.connection.close();
      } catch {
        // Já estamos saindo; uma falha ao fechar o banco não deve impedir isso.
      }
      console.log('  Encerrado.');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

iniciar();

module.exports = app; // exportado para os testes automatizados
