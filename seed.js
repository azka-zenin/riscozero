// seed.js
// Prepara o sistema para uso: cria o primeiro administrador e gera dados de
// demonstração.
//
//   npm run seed
//
// POR QUE O ADMIN NASCE AQUI: criar uma conta exige estar logado como
// administrador. Como no começo não existe nenhum, seria impossível entrar.
// Este script resolve o problema criando o primeiro por fora da API.
//
// SOBRE OS DADOS: as respostas são fictícias, geradas por sorteio. Não
// representam pessoas reais. Cada setor tem um perfil diferente para que o
// painel mostre contrastes — um setor em crise, um saudável, outros no meio.

require('dotenv').config();

const crypto = require('crypto');
const { conectar, desconectar } = require('./database');
const { Resposta } = require('./models/Resposta');
const { Usuario } = require('./models/Usuario');

// base = valor mais provável | variacao = quanto pode oscilar para cada lado
const PERFIS = {
  Producao: { // setor crítico
    estresse: { base: 4.2, variacao: 0.8 },
    sono: { base: 2.0, variacao: 0.8 },
    carga_trabalho: { base: 4.3, variacao: 0.7 },
    ambiente_fisico: { base: 2.2, variacao: 0.8 },
  },
  Manutencao: { // carga alta, ambiente melhor
    estresse: { base: 3.6, variacao: 0.9 },
    sono: { base: 2.6, variacao: 0.9 },
    carga_trabalho: { base: 3.9, variacao: 0.8 },
    ambiente_fisico: { base: 3.0, variacao: 0.9 },
  },
  Qualidade: { // equilibrado
    estresse: { base: 2.6, variacao: 0.9 },
    sono: { base: 3.5, variacao: 0.9 },
    carga_trabalho: { base: 2.8, variacao: 0.9 },
    ambiente_fisico: { base: 3.8, variacao: 0.8 },
  },
  TI: { // saudável, serve de contraponto positivo
    estresse: { base: 2.2, variacao: 0.8 },
    sono: { base: 4.0, variacao: 0.8 },
    carga_trabalho: { base: 2.5, variacao: 0.9 },
    ambiente_fisico: { base: 4.2, variacao: 0.7 },
  },
  Logistica: {
    estresse: { base: 3.2, variacao: 1.0 },
    sono: { base: 2.9, variacao: 0.9 },
    carga_trabalho: { base: 3.4, variacao: 0.9 },
    ambiente_fisico: { base: 3.1, variacao: 0.9 },
  },
  Administrativo: {
    estresse: { base: 2.8, variacao: 0.9 },
    sono: { base: 3.4, variacao: 0.9 },
    carga_trabalho: { base: 2.9, variacao: 0.9 },
    ambiente_fisico: { base: 4.0, variacao: 0.8 },
  },
};

// Comentários fictícios, escritos como um trabalhador escreveria
const COMENTARIOS = {
  Producao: [
    'O ruído da linha nova está muito alto, saio com dor de cabeça.',
    'Três dias seguidos de meta puxada, não estou dando conta.',
    'Faltou gente no turno de novo, sobrou tudo pra gente.',
    'O painel novo é bom mas ninguém treinou a gente direito.',
    'Preciso de pausa, não consigo nem ir no banheiro direito.',
  ],
  Manutencao: [
    'Muito chamado urgente ao mesmo tempo, fica difícil priorizar.',
    'Equipamento novo quebra direto e a cobrança vem pra cima da gente.',
  ],
  Qualidade: [
    'Semana tranquila, deu pra organizar as inspeções.',
    'Sistema novo ajudou a reduzir retrabalho.',
  ],
  TI: [
    'Boa semana, conseguimos automatizar parte dos relatórios.',
    'Sem sobrecarga, dá pra manter o ritmo.',
  ],
  Logistica: [
    'Pico de expedição essa semana pesou bastante.',
    'Empilhadeira parada atrasou tudo, gerou correria.',
  ],
  Administrativo: [
    'Fechamento do mês sempre aperta um pouco.',
    'Ambiente confortável, sem reclamações.',
  ],
};


/**
 * Sorteia uma nota inteira de 1 a 5 em torno de uma base.
 * A média de dois sorteios concentra os valores perto do centro, gerando uma
 * distribuição mais parecida com respostas reais do que um sorteio uniforme.
 */
function sortearNota(perfil, ajuste = 0) {
  const sorteio = (Math.random() + Math.random()) / 2;
  const desvio = (sorteio - 0.5) * 2 * perfil.variacao;
  const valor = Math.round(perfil.base + ajuste + desvio);
  return Math.min(5, Math.max(1, valor));
}

// Turnos e as faixas de horário em que acontecem. O horário sorteado precisa
// combinar com o turno informado, senão os dados de demonstração ficariam
// incoerentes (alguém do turno da noite respondendo às 8h da manhã).
//
// Madrugada divide ao meio o bloco que antes era só "Noite" (22h-5h): Noite
// fica com a entrada da escala (22h-1h) e Madrugada com o miolo mais pesado
// (2h-5h) — duas equipes menores em vez de uma, como acontece de verdade em
// operação contínua. Comercial é expediente de escritório (8h-18h) e se
// sobrepõe de propósito a Manhã/Tarde: representa outra população de
// trabalhador (o pessoal do setor Administrativo), não um turno de fábrica.
const TURNOS = [
  { chave: 'Manha', horaInicio: 6, horaFim: 13 },
  { chave: 'Tarde', horaInicio: 14, horaFim: 21 },
  { chave: 'Noite', horaInicio: 22, horaFim: 1 },
  { chave: 'Madrugada', horaInicio: 2, horaFim: 5 },
  { chave: 'Comercial', horaInicio: 8, horaFim: 18 },
];

// Como o turno afeta as notas. Baseado em algo real: quem trabalha à noite
// dorme pior (o corpo não descansa igual de dia) e conta com menos gente por
// perto, o que aumenta a carga individual. Madrugada leva isso adiante (é o
// ponto de menor vigília circadiana); Comercial não carrega desgaste de
// turno de fábrica, só o baseline de quem trabalha em horário comum. Sem
// esse ajuste, os turnos sairiam praticamente iguais e o gráfico por turno
// não mostraria nada.
const EFEITO_TURNO = {
  Manha: { estresse: 0, sono: 0.3, carga_trabalho: 0, ambiente_fisico: 0.2 },
  Tarde: { estresse: 0.2, sono: 0, carga_trabalho: 0.2, ambiente_fisico: 0 },
  Noite: { estresse: 0.4, sono: -1.1, carga_trabalho: 0.5, ambiente_fisico: -0.3 },
  Madrugada: { estresse: 0.5, sono: -1.3, carga_trabalho: 0.5, ambiente_fisico: -0.3 },
  Comercial: { estresse: 0, sono: 0.2, carga_trabalho: 0, ambiente_fisico: 0.3 },
};

// Pesos do sorteio de turno — Manhã e Tarde concentram a maior parte da
// fábrica; Noite e Madrugada dividem a escala noturna, menor por natureza;
// Comercial fica com uma fatia pequena, do tamanho do quadro administrativo.
const PESOS_TURNO = [
  { chave: 'Manha', peso: 0.38 },
  { chave: 'Tarde', peso: 0.34 },
  { chave: 'Noite', peso: 0.10 },
  { chave: 'Madrugada', peso: 0.08 },
  { chave: 'Comercial', peso: 0.10 },
];

/** Sorteia um turno conforme os pesos de PESOS_TURNO. */
function sortearTurno() {
  const sorteio = Math.random();
  let acumulado = 0;
  for (const { chave, peso } of PESOS_TURNO) {
    acumulado += peso;
    if (sorteio < acumulado) return chave;
  }
  return PESOS_TURNO[PESOS_TURNO.length - 1].chave; // salvaguarda de arredondamento
}


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

/** Data recuada N dias, com horário coerente com o turno informado. */
function dataRecuada(diasAtras, turno) {
  const data = new Date();
  data.setDate(data.getDate() - diasAtras);

  const faixa = TURNOS.find((t) => t.chave === turno);
  let hora;
  if (faixa.horaInicio <= faixa.horaFim) {
    hora = faixa.horaInicio + Math.floor(Math.random() * (faixa.horaFim - faixa.horaInicio + 1));
  } else {
    // O turno da noite atravessa a meia-noite (22h às 5h), então a faixa
    // precisa dar a volta no relógio.
    const tamanho = (24 - faixa.horaInicio) + faixa.horaFim + 1;
    hora = (faixa.horaInicio + Math.floor(Math.random() * tamanho)) % 24;
  }

  data.setHours(hora, Math.floor(Math.random() * 60), 0, 0);
  return data;
}

const DIAS = 30;

async function criarAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@riscozero.local').toLowerCase();
  // Sem ADMIN_SENHA no .env, sorteia uma senha em vez de usar um valor fixo:
  // um literal fixo neste arquivo ficaria commitado no GitHub, e qualquer
  // pessoa com acesso ao repositório saberia a senha do primeiro admin de
  // qualquer instalação que esquecesse de preencher a variável.
  const senha = process.env.ADMIN_SENHA || crypto.randomBytes(9).toString('base64url');
  const nome = process.env.ADMIN_NOME || 'Administrador';

  const existente = await Usuario.findOne({ email });
  if (existente) {
    console.log(`Administrador já existe (${email}) — mantido como está.`);
    return;
  }

  const admin = new Usuario({ nome, email, papel: 'admin' });
  await admin.definirSenha(senha);
  await admin.save();

  console.log('');
  console.log('  Administrador criado:');
  console.log(`    E-mail: ${email}`);
  console.log(`    Senha:  ${senha}`);
  console.log('    Troque esta senha no painel assim que entrar.');
  console.log('');
}

async function gerarRespostas() {
  const setores = Object.keys(PERFIS);
  const registros = [];

  for (let dia = DIAS - 1; dia >= 0; dia--) {
    const data = new Date();
    data.setDate(data.getDate() - dia);
    const diaSemana = data.getDay(); // 0 = domingo, 6 = sábado

    // Fim de semana tem bem menos respostas (fábrica opera reduzida)
    const ehFimDeSemana = diaSemana === 0 || diaSemana === 6;
    const quantidade = ehFimDeSemana
      ? Math.floor(Math.random() * 3)
      : 6 + Math.floor(Math.random() * 7);

    for (let i = 0; i < quantidade; i++) {
      const setor = setores[Math.floor(Math.random() * setores.length)];
      const perfil = PERFIS[setor];
      const turno = sortearTurno();
      const efeito = EFEITO_TURNO[turno];

      // Aplica o efeito do turno e, no setor em piora, o agravamento do dia
      const piora = setor === SETOR_EM_PIORA ? agravamento(dia, DIAS) : 0;
      const comTurno = (indicador) => {
        // Sono e ambiente são invertidos: neles, "piorar" significa nota MENOR
        const invertido = indicador === 'sono' || indicador === 'ambiente_fisico';
        return {
          base: perfil[indicador].base + efeito[indicador] + (invertido ? -piora : piora),
          variacao: perfil[indicador].variacao,
        };
      };

      // ~20% das respostas vêm com comentário, como acontece na prática
      const lista = COMENTARIOS[setor] || [];
      const comentario = Math.random() < 0.2 && lista.length > 0
        ? lista[Math.floor(Math.random() * lista.length)]
        : null;

      registros.push({
        setor,
        turno,
        estresse: sortearNota(comTurno('estresse')),
        sono: sortearNota(comTurno('sono')),
        carga_trabalho: sortearNota(comTurno('carga_trabalho')),
        ambiente_fisico: sortearNota(comTurno('ambiente_fisico')),
        comentario,
        data_envio: dataRecuada(dia, turno),
      });
    }
  }

  console.log(`Gerando ${registros.length} respostas de demonstração...`);
  await Resposta.insertMany(registros);
  console.log(`Pronto! ${registros.length} respostas inseridas ao longo dos últimos ${DIAS} dias.`);
}

(async () => {
  try {
    await conectar();
    await criarAdmin();
    await gerarRespostas();
    console.log('Suba o servidor com "npm start" e acesse o painel.');
    await desconectar();
    process.exit(0);
  } catch (erro) {
    console.error('Erro ao preparar os dados:', erro.message);
    process.exit(1);
  }
})();
