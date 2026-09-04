// models/TokenBI.js
// Chave de leitura para ferramentas de análise (Power BI, Looker, planilhas).
//
// POR QUE NÃO REUSAR O TOKEN DE LOGIN: o JWT de gestão vale 8 horas e dá
// acesso a tudo — inclusive trocar senha e, para admins, criar contas. Uma
// atualização agendada do Power BI às 6h da manhã precisaria de uma sessão
// que não expirasse, e colocar uma credencial dessas dentro de um relatório
// que circula por e-mail é entregar o sistema junto com o gráfico.
//
// Esta chave é o oposto: só lê, dura o que foi configurado, e pode ser
// revogada sozinha sem derrubar o login de ninguém.
//
// O QUE FICA GUARDADO: apenas o hash SHA-256 da chave, nunca ela mesma. Quem
// criou vê o valor uma única vez, na resposta da criação. Se perder, cria
// outra — não existe como recuperar, e isso é proposital: um vazamento do
// banco não pode virar acesso aos dados.
//
// POR QUE SHA-256 E NÃO BCRYPT (que é o usado nas senhas de usuário): senha
// é escolhida por gente e costuma ser curta e adivinhável, então precisa de
// um hash lento de propósito. A chave aqui é gerada por sorteio com 32 bytes
// de aleatoriedade — não há dicionário que a alcance, e o hash rápido permite
// achar o registro direto pelo índice em vez de testar um por um.

const mongoose = require('mongoose');

const tokenBISchema = new mongoose.Schema(
  {
    // Para quem/para quê esta chave foi criada ("Power BI do RH"). Serve para
    // dar de baixa a certa quando alguém sai da empresa.
    nome: {
      type: String,
      required: [true, 'Dê um nome à chave, para saber depois de quem ela é.'],
      trim: true,
      maxlength: [80, 'O nome pode ter no máximo 80 caracteres.'],
    },

    hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Só os primeiros caracteres da chave, para o painel conseguir mostrar
    // qual é qual sem guardar o valor inteiro.
    prefixo: {
      type: String,
      required: true,
    },

    // E-mail de quem criou, guardado como texto pelo mesmo motivo do
    // AcaoAlerta: o registro precisa sobreviver à conta ser apagada.
    criadoPor: {
      type: String,
      required: true,
      trim: true,
    },

    criadoEm: {
      type: Date,
      default: Date.now,
    },

    expiraEm: {
      type: Date,
      required: true,
    },

    // Quando foi usada pela última vez. É o que permite achar chaves
    // esquecidas: uma que ninguém usa há meses não deveria continuar válida.
    ultimoUso: {
      type: Date,
      default: null,
    },

    // Revogar em vez de apagar mantém o rastro de que a chave existiu e de
    // quando deixou de valer — apagar a linha faria a auditoria perder isso.
    revogadaEm: {
      type: Date,
      default: null,
    },
  },
  { versionKey: false },
);

const TokenBI = mongoose.model('TokenBI', tokenBISchema);

module.exports = { TokenBI };
