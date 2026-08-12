// models/Usuario.js
// Contas de acesso ao painel de gestão.
//
// O QUE MUDOU EM RELAÇÃO À VERSÃO ANTERIOR:
// Antes existia uma única senha, escrita em texto puro dentro do config.js e
// compartilhada por todo mundo. Isso trazia dois problemas: qualquer pessoa
// que abrisse o arquivo via a senha, e não havia como saber quem acessou o
// quê. Agora cada gestor tem a própria conta, e a senha é guardada como hash.
//
// O QUE É UM HASH: em vez de gravar "minhasenha123", gravamos o resultado de
// uma conta matemática que só funciona em um sentido. Dá para verificar se a
// senha digitada gera o mesmo resultado, mas não dá para voltar do resultado
// até a senha original. Se o banco vazar, as senhas continuam protegidas.

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Quantas rodadas de embaralhamento o bcrypt aplica. Quanto maior, mais lento
// para calcular — de propósito, porque isso também torna lento o trabalho de
// quem tentar adivinhar senhas por força bruta. 10 é o equilíbrio usual entre
// segurança e tempo de resposta no login.
const RODADAS_BCRYPT = 10;

const usuarioSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: [true, 'Informe o nome do usuário.'],
      trim: true,
      minlength: [2, 'O nome precisa ter pelo menos 2 caracteres.'],
      maxlength: [100, 'O nome pode ter no máximo 100 caracteres.'],
    },

    email: {
      type: String,
      required: [true, 'Informe o e-mail.'],
      unique: true,
      lowercase: true, // evita que "Ana@x.com" e "ana@x.com" virem contas diferentes
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'E-mail em formato inválido.'],
    },

    senhaHash: {
      type: String,
      required: true,
      // select: false faz o campo NÃO vir nas consultas por padrão. Assim, se
      // alguém esquecer de filtrar os campos ao listar usuários, o hash não
      // escapa junto na resposta da API.
      select: false,
    },

    // Dois níveis apenas, porque mais do que isso seria complexidade sem uso
    // real neste projeto:
    //   admin   → pode gerenciar usuários
    //   gestor  → vê o painel, mas não mexe em contas
    papel: {
      type: String,
      enum: {
        values: ['admin', 'gestor'],
        message: 'Papel deve ser admin ou gestor.',
      },
      default: 'gestor',
    },

    // Permite tirar o acesso de alguém sem apagar o registro — útil para
    // manter o histórico de quem já teve acesso ao sistema.
    ativo: {
      type: Boolean,
      default: true,
    },

    ultimoAcesso: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'usuarios',
    versionKey: false,
    timestamps: true, // adiciona createdAt e updatedAt automaticamente
  }
);

/**
 * Define a senha, já convertendo para hash.
 * Sempre use este método — nunca escreva em senhaHash diretamente, ou uma
 * senha em texto puro acabaria gravada no banco.
 */
usuarioSchema.methods.definirSenha = async function (senhaEmTexto) {
  if (!senhaEmTexto || senhaEmTexto.length < 6) {
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  }
  this.senhaHash = await bcrypt.hash(senhaEmTexto, RODADAS_BCRYPT);
};

/**
 * Confere se a senha digitada corresponde à cadastrada.
 * Requer que o documento tenha sido buscado com .select('+senhaHash'),
 * já que o campo fica oculto por padrão.
 */
usuarioSchema.methods.senhaConfere = async function (senhaEmTexto) {
  if (!this.senhaHash) {
    throw new Error('Usuário carregado sem o campo senhaHash. Use .select("+senhaHash").');
  }
  return bcrypt.compare(senhaEmTexto, this.senhaHash);
};

/**
 * Versão segura do usuário para enviar pela API — sem o hash da senha.
 */
usuarioSchema.methods.paraJSON = function () {
  return {
    id: this._id,
    nome: this.nome,
    email: this.email,
    papel: this.papel,
    ativo: this.ativo,
    ultimoAcesso: this.ultimoAcesso,
    criadoEm: this.createdAt,
  };
};

const Usuario = mongoose.model('Usuario', usuarioSchema);

module.exports = { Usuario };
