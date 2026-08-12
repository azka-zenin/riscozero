// testes/servidor-demo.js
// Sobe o RiscoZero com o banco simulado em memória, já populado com dados de
// exemplo. Serve para conferir as telas no navegador sem precisar de MongoDB.
//
//   node testes/servidor-demo.js
//
// Entre com:  pedro@ceeppg.br  /  senha123   (administrador)
//             ana@ceeppg.br    /  senha456   (gestor, sem acesso a contas)
//
// ATENÇÃO: os dados somem quando o processo é encerrado. Para uso real, use
// "npm start" com o MongoDB configurado no .env.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-demonstracao-1234567890';

const express = require('express');
const path = require('path');
const { instalar } = require('./mongo-falso');
const { Resposta } = require('../models/Resposta');
const { Usuario } = require('../models/Usuario');
const { LogAcesso } = require('../models/LogAcesso');
const { seguranca } = require('../middleware/seguranca');

instalar(Resposta, { datas: ['data_envio'] });
instalar(Usuario, { unicos: ['email'], datas: ['ultimoAcesso', 'createdAt', 'updatedAt'] });
instalar(LogAcesso, { datas: ['data'] });

const authRouter = require('../routes/auth');
const usuariosRouter = require('../routes/usuarios');
const logsRouter = require('../routes/logs');
const respostasRouter = require('../routes/respostas');

const app = express();
app.use(express.json());
app.use(seguranca);
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
// Mesma rota de saude do server.js, para os testes cobrirem o caminho que a
// hospedagem usa para saber se a aplicacao esta de pe.
app.get('/api/saude', (req, res) => {
  res.json({ ok: true, banco: 'simulado', versao: require('../package.json').version });
});

app.use('/api/auth', authRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/logs', logsRouter);
app.use('/api/respostas', respostasRouter);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota da API não encontrada.' }));

// Mesmo catch-all de server.js, para o modo de demonstração se comportar
// igual ao servidor real caso alguém digite um endereço errado.
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html')));

// Perfis por setor, iguais aos do seed.js
const PERFIS = {
  Producao: { estresse: 4.2, sono: 2.0, carga: 4.3, ambiente: 2.2 },
  Manutencao: { estresse: 3.6, sono: 2.6, carga: 3.9, ambiente: 3.0 },
  Qualidade: { estresse: 2.6, sono: 3.5, carga: 2.8, ambiente: 3.8 },
  TI: { estresse: 2.2, sono: 4.0, carga: 2.5, ambiente: 4.2 },
  Logistica: { estresse: 3.2, sono: 2.9, carga: 3.4, ambiente: 3.1 },
  Administrativo: { estresse: 2.8, sono: 3.4, carga: 2.9, ambiente: 4.0 },
};

const COMENTARIOS = {
  Producao: ['O ruído da linha nova está muito alto, saio com dor de cabeça.',
    'Três dias seguidos de meta puxada, não estou dando conta.',
    'Faltou gente no turno de novo, sobrou tudo pra gente.'],
  Manutencao: ['Muito chamado urgente ao mesmo tempo, fica difícil priorizar.'],
  Qualidade: ['Semana tranquila, deu pra organizar as inspeções.'],
  TI: ['Boa semana, conseguimos automatizar parte dos relatórios.'],
  Logistica: ['Pico de expedição essa semana pesou bastante.'],
  Administrativo: ['Fechamento do mês sempre aperta um pouco.'],
};

function nota(base) {
  const sorteio = (Math.random() + Math.random()) / 2;
  return Math.min(5, Math.max(1, Math.round(base + (sorteio - 0.5) * 1.8)));
}

// Como o turno afeta as notas: quem trabalha à noite dorme pior e costuma ter
// menos gente por perto, o que aumenta a carga individual. Sem esse ajuste os
// três turnos sairiam iguais e o gráfico por turno não mostraria nada.
const EFEITO_TURNO = {
  Manha: { estresse: 0, sono: 0.3, carga: 0, ambiente: 0.2 },
  Tarde: { estresse: 0.2, sono: 0, carga: 0.2, ambiente: 0 },
  Noite: { estresse: 0.4, sono: -1.1, carga: 0.5, ambiente: -0.3 },
};

function sortearTurno() {
  const s = Math.random();
  if (s < 0.42) return 'Manha';
  if (s < 0.80) return 'Tarde';
  return 'Noite';
}

// Faixas de horário de cada turno. O horário sorteado precisa combinar com o
// turno informado, senão os dados de demonstração ficariam incoerentes —
// alguém do turno da noite respondendo às 8h da manhã.
const FAIXAS_TURNO = [
  { chave: 'Manha', horaInicio: 6, horaFim: 13 },
  { chave: 'Tarde', horaInicio: 14, horaFim: 21 },
  { chave: 'Noite', horaInicio: 22, horaFim: 5 },
];


// Um setor com piora progressiva ao longo do período.
//
// POR QUE ISSO EXISTE: com todos os setores sorteados de forma estável, o
// painel nunca mostraria a análise de tendência funcionando — e é justamente
// ela que sustenta o argumento de "agir antes de virar problema". Aqui a
// Produção vai piorando aos poucos, como aconteceria numa fábrica que entrou
// num período de meta apertada.
const SETOR_EM_PIORA = 'Producao';

/**
 * Quanto piorar, conforme o dia se aproxima de hoje.
 * @param diasAtras 0 = hoje, DIAS-1 = o dia mais antigo
 */
function agravamento(diasAtras, totalDias) {
  const proximidade = (totalDias - 1 - diasAtras) / (totalDias - 1); // 0 a 1
  return proximidade * 1.2; // piora até 1,2 ponto do começo ao fim
}

/** Sorteia um horário coerente com o turno. */
function horaDoTurno(turno) {
  const faixa = FAIXAS_TURNO.find((t) => t.chave === turno);
  if (faixa.horaInicio <= faixa.horaFim) {
    return faixa.horaInicio + Math.floor(Math.random() * (faixa.horaFim - faixa.horaInicio + 1));
  }
  // A noite atravessa a meia-noite (22h às 5h), então a faixa dá a volta
  const tamanho = (24 - faixa.horaInicio) + faixa.horaFim + 1;
  return (faixa.horaInicio + Math.floor(Math.random() * tamanho)) % 24;
}

async function popular() {
  const admin = new Usuario({ nome: 'Pedro Marques', email: 'pedro@ceeppg.br', papel: 'admin' });
  await admin.definirSenha('senha123');
  await admin.save();

  const gestor = new Usuario({ nome: 'Ana Gestora', email: 'ana@ceeppg.br', papel: 'gestor' });
  await gestor.definirSenha('senha456');
  await gestor.save();

  const inativo = new Usuario({ nome: 'Bruno Antigo', email: 'bruno@ceeppg.br', papel: 'gestor', ativo: false });
  await inativo.definirSenha('senha789');
  await inativo.save();

  const setores = Object.keys(PERFIS);
  const registros = [];

  for (let dia = 29; dia >= 0; dia--) {
    const data = new Date();
    data.setDate(data.getDate() - dia);
    const fds = data.getDay() === 0 || data.getDay() === 6;
    const qtd = fds ? Math.floor(Math.random() * 3) : 6 + Math.floor(Math.random() * 7);

    for (let i = 0; i < qtd; i++) {
      const setor = setores[Math.floor(Math.random() * setores.length)];
      const p = PERFIS[setor];
      const turno = sortearTurno();
      const e = EFEITO_TURNO[turno];
      const quando = new Date(data);
      quando.setHours(horaDoTurno(turno), Math.floor(Math.random() * 60), 0, 0);
      const lista = COMENTARIOS[setor] || [];

      // No setor em piora, o quadro se agrava conforme se aproxima de hoje.
      // Sono e ambiente são invertidos: piorar neles significa nota MENOR.
      const piora = setor === SETOR_EM_PIORA ? agravamento(dia, 30) : 0;

      registros.push({
        setor,
        turno,
        estresse: nota(p.estresse + e.estresse + piora),
        sono: nota(p.sono + e.sono - piora),
        carga_trabalho: nota(p.carga + e.carga + piora),
        ambiente_fisico: nota(p.ambiente + e.ambiente - piora),
        comentario: Math.random() < 0.2 && lista.length
          ? lista[Math.floor(Math.random() * lista.length)] : null,
        data_envio: quando,
      });
    }
  }

  await Resposta.insertMany(registros);
  return registros.length;
}

const PORTA = process.env.PORT || 3000;

popular().then((total) => {
  app.listen(PORTA, () => {
    console.log('');
    console.log('  RiscoZero — modo demonstração (banco em memória)');
    console.log(`  ${total} respostas de exemplo carregadas`);
    console.log('');
    console.log(`  Formulário: http://localhost:${PORTA}`);
    console.log(`  Painel:     http://localhost:${PORTA}/login.html`);
    console.log('');
    console.log('  Admin:  pedro@ceeppg.br / senha123');
    console.log('  Gestor: ana@ceeppg.br   / senha456');
    console.log('');
  });
});
