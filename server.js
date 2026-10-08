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
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const { conectar, mongoose } = require('./database');
const { seguranca } = require('./middleware/seguranca');
const { estaticos } = require('./middleware/estaticos');

const respostasRouter = require('./routes/respostas');
const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const logsRouter = require('./routes/logs');
const biRouter = require('./routes/bi');
const { resetarAdminPorAmbiente } = require('./utils/reset-por-ambiente');

const app = express();

// Servidor HTTP criado à parte (em vez de só app.listen) porque o
// Socket.IO precisa se anexar a ele diretamente — WebSocket faz upgrade da
// mesma conexão HTTP, não é um servidor separado.
const servidorHttp = http.createServer(app);

// Sem opções de CORS: front e API são servidos pelo mesmo processo, na mesma
// origem, então não existe domínio externo para liberar.
const io = new Server(servidorHttp);
app.set('io', io);

// Quando o sistema roda publicado, as requisições chegam através de um
// intermediário da hospedagem. Sem esta linha, o Express veria o endereço do
// intermediário em vez do de quem realmente acessou — e o histórico de acessos
// registraria sempre o mesmo IP para todo mundo.
app.set('trust proxy', 1);

// O limite fica explícito (o padrão do Express também é 100kb, mas escrito
// aqui vira decisão, não sorte). A maior coisa que este sistema recebe é uma
// resposta de formulário com um comentário de até 500 caracteres — 100kb é
// muitas ordens de grandeza acima disso, e barra alguém tentando ocupar a
// memória do processo mandando um corpo gigante numa rota pública.
app.use(express.json({ limit: '100kb' }));

// Comprime toda resposta antes de enviar — o arquivo do Chart.js sozinho tem
// mais de 200KB, e numa wifi de escola isso é diferença real de tempo de
// carregamento. Cedo na cadeia, de propósito: cobre tanto os arquivos
// estáticos quanto as respostas JSON da API.
app.use(compression());

// Cabeçalhos de segurança em toda resposta, inclusive nos arquivos estáticos —
// por isso vem antes do express.static.
app.use(seguranca);

// Arquivos da pasta public. A configuração de cache mora em
// middleware/estaticos.js porque o modo de demonstração usa exatamente a
// mesma — ver o comentário de lá.
app.use(estaticos);

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
app.use('/api/bi', biRouter);

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
    await resetarAdminPorAmbiente();

    servidorHttp.listen(config.PORTA, () => {
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

    configurarEncerramentoGracioso(servidorHttp);
    configurarRedeDeSeguranca();
  } catch (erro) {
    console.error('');
    console.error('  Não foi possível iniciar o RiscoZero.');
    console.error('  ' + erro.message);
    console.error('');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Rede de segurança para erro que escapou de todo o resto
//
// O tratador de erros do Express (acima) só alcança o que acontece DENTRO de
// uma rota. Uma promise rejeitada fora desse caminho — um await esquecido, uma
// falha de rede do driver do banco entre requisições — não passa por ele: no
// Node 18+ ela derruba o processo inteiro, na hora, sem passar pelo
// encerramento gracioso.
//
// Numa hospedagem que reinicia sozinha isso seria um susto de alguns segundos.
// No meio de uma apresentação, é a tela morrendo na frente da banca. Aqui a
// falha vira log e o servidor continua de pé: uma requisição pode ter falhado,
// mas as outras seguem sendo atendidas.
//
// NÃO é lugar de esconder erro: o console.error registra tudo, e o objetivo é
// só evitar que uma falha isolada leve o sistema junto.
function configurarRedeDeSeguranca() {
  process.on('unhandledRejection', (motivo) => {
    console.error('Promise rejeitada sem tratamento:', motivo);
  });

  // Exceção síncrona não capturada deixa o processo num estado que não dá
  // para garantir — o Node avisa isso na documentação. Então aqui a conduta é
  // outra: registra e sai pelo caminho normal de encerramento, para o serviço
  // de hospedagem subir um processo novo e limpo em vez de seguir com um
  // possivelmente quebrado.
  process.on('uncaughtException', (erro) => {
    console.error('Exceção não capturada:', erro);
    process.exit(1);
  });
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
