// models/LogAcesso.js
// Registro de quem entrou (ou tentou entrar) no painel de gestão.
//
// POR QUE ISSO EXISTE: sem registro, não há como saber se alguém acessou os
// dados indevidamente, nem perceber uma sequência de tentativas com senha
// errada — que é o sinal típico de alguém tentando adivinhar uma senha.
//
// O QUE NÃO É GUARDADO: nenhuma senha, nem sequer a errada que a pessoa
// digitou. Guardar a tentativa parece útil para investigar, mas seria uma
// coleção cheia de senhas em texto puro — inclusive senhas reais digitadas na
// conta errada por engano.

const mongoose = require('mongoose');

const logAcessoSchema = new mongoose.Schema(
  {
    // Guardamos o e-mail como texto, não como referência ao usuário, porque o
    // registro precisa sobreviver à conta ser apagada — e porque uma tentativa
    // com e-mail inexistente também precisa ser registrada.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // Guardado no momento do login. Se a pessoa mudar de nome depois, o
    // registro mantém como ela se chamava na época.
    nome: {
      type: String,
      default: null,
    },

    sucesso: {
      type: Boolean,
      required: true,
      index: true,
    },

    // Por que falhou, quando falhou. Ajuda a distinguir "errou a senha" de
    // "tentou entrar com uma conta que nem existe".
    motivo: {
      type: String,
      enum: ['ok', 'senha_incorreta', 'usuario_inexistente', 'conta_desativada'],
      required: true,
    },

    // Endereço de rede de onde veio a tentativa. Não identifica a pessoa, mas
    // permite notar que dez tentativas erradas vieram todas do mesmo lugar.
    origem: {
      type: String,
      default: null,
    },

    data: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'logs_acesso',
    versionKey: false,
  }
);

// A consulta padrão da tela é "os mais recentes primeiro"
logAcessoSchema.index({ data: -1 });

const LogAcesso = mongoose.model('LogAcesso', logAcessoSchema);

/**
 * Registra uma tentativa de acesso.
 *
 * Nunca lança erro: se o registro falhar, o login em si não pode ser
 * interrompido por causa disso. Um problema na auditoria não deve impedir
 * alguém de entrar no sistema.
 */
async function registrar({ email, nome, sucesso, motivo, origem }) {
  try {
    await LogAcesso.create({ email, nome, sucesso, motivo, origem });
  } catch (erro) {
    console.error('Não foi possível registrar o acesso:', erro.message);
  }
}

module.exports = { LogAcesso, registrar };
