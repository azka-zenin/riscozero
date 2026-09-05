// models/Resposta.js
// Formato de uma resposta do formulário de bem-estar.
//
// Cada documento representa UMA pessoa respondendo UMA vez. Não guardamos
// nome, matrícula ou qualquer identificador individual — só o setor. Isso é
// intencional: ninguém responde com sinceridade sobre estresse sabendo que a
// resposta tem o nome dele colado.

const mongoose = require('mongoose');

// Os setores válidos ficam listados aqui, no mesmo lugar onde o dado é
// definido. O Mongoose recusa qualquer valor fora desta lista, então texto
// aleatório enviado direto para a API não entra no banco e não suja os
// gráficos com um "setor" que ninguém sabe o que é.
const SETORES = {
  Producao: 'Produção',
  Manutencao: 'Manutenção',
  Qualidade: 'Qualidade',
  Logistica: 'Logística',
  TI: 'TI / Automação',
  Administrativo: 'Administrativo',
};

// Turnos de trabalho. Assim como os setores, ficam listados aqui para que o
// Mongoose recuse qualquer valor fora da lista.
const TURNOS = {
  Manha: 'Manhã',
  Tarde: 'Tarde',
  Noite: 'Noite',
  Madrugada: 'Madrugada',
  Comercial: 'Comercial',
};

// Regra reaproveitada pelos quatro indicadores: número inteiro de 1 a 5.
function escala(nomeAmigavel) {
  return {
    type: Number,
    required: [true, `Responda: ${nomeAmigavel}.`],
    min: [1, `${nomeAmigavel} deve ser de 1 a 5.`],
    max: [5, `${nomeAmigavel} deve ser de 1 a 5.`],
    validate: {
      validator: Number.isInteger,
      message: `${nomeAmigavel} deve ser um número inteiro.`,
    },
  };
}

const respostaSchema = new mongoose.Schema(
  {
    setor: {
      type: String,
      required: [true, 'Selecione o seu setor.'],
      enum: {
        values: Object.keys(SETORES),
        message: 'Setor inválido.',
      },
      index: true, // acelera o agrupamento por setor, que é a consulta mais usada
    },

    // Turno em que a pessoa trabalhou no dia da resposta.
    //
    // POR QUE ISSO IMPORTA: o mesmo setor pode estar tranquilo de manhã e em
    // crise à noite — o turno noturno costuma ter menos gente, menos apoio e
    // prejudica o sono de quem trabalha nele. Sem separar por turno, os dois se
    // misturam numa média que não mostra nem um nem outro.
    //
    // SOBRE REGISTROS ANTIGOS: as respostas gravadas antes deste campo existir
    // não têm turno. Elas continuam válidas e legíveis, porque a validação vale
    // no momento de gravar, não ao ler. As consultas por turno as excluem de
    // propósito, para não criar um grupo "vazio" nos gráficos.
    turno: {
      type: String,
      required: [true, 'Selecione o seu turno.'],
      enum: {
        values: Object.keys(TURNOS),
        message: 'Turno inválido.',
      },
      index: true,
    },

    // ATENÇÃO ÀS ESCALAS: as quatro perguntas usam 1 a 5, mas não apontam
    // para o mesmo lado. Em estresse e carga, nota alta é RUIM. Em sono e
    // ambiente, nota alta é BOA. A conversão para "nota de risco" acontece em
    // utils/analise.js — aqui guardamos exatamente o que a pessoa respondeu.
    estresse: escala('Nível de estresse'),
    sono: escala('Qualidade do sono'),
    carga_trabalho: escala('Carga de trabalho'),
    ambiente_fisico: escala('Conforto do ambiente físico'),

    comentario: {
      type: String,
      trim: true,
      maxlength: [500, 'O comentário pode ter no máximo 500 caracteres.'],
      default: null,
    },

    // Guardado como Date (e não texto) para permitir filtrar por período e
    // agrupar por dia diretamente no banco.
    data_envio: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'respostas',
    versionKey: false, // remove o campo __v, que não usamos
  }
);

// Índice combinado: as consultas do painel quase sempre filtram por data e
// agrupam por setor ao mesmo tempo. Um índice com os dois campos atende
// melhor essas buscas do que dois índices separados.
respostaSchema.index({ data_envio: -1, setor: 1 });
respostaSchema.index({ data_envio: -1, turno: 1 });

const Resposta = mongoose.model('Resposta', respostaSchema);

module.exports = { Resposta, SETORES, TURNOS };
