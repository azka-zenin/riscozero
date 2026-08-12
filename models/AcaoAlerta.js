// models/AcaoAlerta.js
// Registro de que a gestão tomou alguma ação depois de um alerta de setor.
//
// POR QUE ISSO EXISTE: o painel aponta o problema e sugere o que fazer, mas
// não fecha o ciclo — não há como saber, olhando só o índice, se alguém já
// agiu sobre aquele alerta ou se ele está simplesmente sendo ignorado. Este
// registro é o primeiro elo dessa corrente: alerta → ação marcada.
//
// O QUE NÃO É: não mede se o índice melhorou depois (isso pediria comparar
// o "antes" e o "depois" por setor, o que fica para uma evolução futura).
// E não referencia nenhuma resposta individual — é uma ação sobre o alerta
// do setor como um todo, não sobre uma pessoa.

const mongoose = require('mongoose');
const { SETORES } = require('./Resposta');

const acaoAlertaSchema = new mongoose.Schema(
  {
    setor: {
      type: String,
      required: true,
      enum: Object.keys(SETORES),
      index: true,
    },

    // E-mail de quem marcou a ação, para o painel mostrar "registrado por
    // fulano". Guardado como texto (não referência), pelo mesmo motivo do
    // LogAcesso: o registro precisa sobreviver à conta ser apagada.
    criadoPor: {
      type: String,
      required: true,
      trim: true,
    },

    // Texto curto e opcional descrevendo a ação tomada. Sem exigir nada
    // aqui: às vezes só marcar "resolvido" já é suficiente.
    observacao: {
      type: String,
      trim: true,
      maxlength: [300, 'A observação pode ter no máximo 300 caracteres.'],
      default: null,
    },

    criadoEm: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'acoes_alerta',
    versionKey: false,
  }
);

// A consulta do painel é sempre "a ação mais recente deste setor"
acaoAlertaSchema.index({ setor: 1, criadoEm: -1 });

const AcaoAlerta = mongoose.model('AcaoAlerta', acaoAlertaSchema);

module.exports = { AcaoAlerta };
