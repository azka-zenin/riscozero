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
      // O que chega aqui numa tentativa que falhou é texto livre, digitado por
      // quem tentou entrar — inclusive por quem está sondando o sistema, que
      // não tem obrigação nenhuma de mandar um e-mail de verdade. O teto evita
      // que cada tentativa grave um texto gigante no histórico.
      maxlength: 254, // limite de endereço de e-mail definido pela RFC 5321
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
      // exportou_csv / exportou_pdf não são tentativas de login: registram
      // quem baixou os dados, já que o CSV e o PDF levam as respostas para
      // fora do painel (ver routes/respostas.js).
      enum: [
        'ok', 'senha_incorreta', 'usuario_inexistente', 'conta_desativada',
        'exportou_csv', 'exportou_pdf',
      ],
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
