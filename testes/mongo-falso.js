// testes/mongo-falso.js
// Substitui o acesso ao banco por uma versão em memória, para que os testes
// automatizados rodem sem precisar de um MongoDB instalado ou de internet.
//
// POR QUE ISSO EXISTE: rodar os testes exigiria subir um MongoDB de verdade.
// Este arquivo troca só a parte que grava e lê do banco, mantendo intactos os
// models do Mongoose — ou seja, as validações, os métodos de senha e as regras
// declaradas continuam sendo os mesmos do sistema real. As consultas de
// agregação rodam pelo mingo, que implementa os mesmos operadores do MongoDB.
//
// IMPORTANTE: isto é usado APENAS nos testes. O sistema em produção usa o
// MongoDB de verdade, via database.js.

const mongoose = require('mongoose');
const { Query, Aggregator } = require('mingo');

/**
 * Converte um documento do Mongoose em objeto simples, do jeito que ele ficaria
 * gravado no banco. É sobre esses objetos que as consultas rodam.
 */
function paraObjeto(doc) {
  return JSON.parse(JSON.stringify(doc.toObject ? doc.toObject() : doc, (chave, valor) => valor));
}

/**
 * Reidrata datas, que viram texto ao passar por JSON.
 * Sem isso, comparações de período e o agrupamento por dia falhariam.
 */
function corrigirDatas(obj, camposDeData) {
  camposDeData.forEach((campo) => {
    if (obj[campo] && typeof obj[campo] === 'string') {
      obj[campo] = new Date(obj[campo]);
    }
  });
  return obj;
}

/**
 * Simula o encadeamento .sort().limit().lean() do Mongoose.
 * Cada método devolve o próprio objeto, e o resultado só é calculado no final
 * (quando alguém dá await), igual ao comportamento real.
 */
function consulta(obterDocs, filtro, opcoes = {}) {
  const estado = { ordem: null, limite: null, pular: 0, lean: false, selecionar: null };

  const executar = () => {
    let resultado = obterDocs().filter((d) => new Query(filtro).test(d.__plano));

    if (estado.ordem) {
      const [campo, direcao] = Object.entries(estado.ordem)[0];
      resultado = [...resultado].sort((a, b) => {
        const va = a.__plano[campo];
        const vb = b.__plano[campo];
        if (va === vb) return 0;
        return (va > vb ? 1 : -1) * direcao;
      });
    }

    // A ordem importa: no MongoDB o skip vem antes do limit. Trocar os dois
    // faria a página 2 devolver linhas que a página 1 já tinha mostrado.
    if (estado.pular > 0) resultado = resultado.slice(estado.pular);
    if (estado.limite !== null) resultado = resultado.slice(0, estado.limite);

    return estado.lean
      ? resultado.map((d) => corrigirDatas({ ...d.__plano }, opcoes.datas || []))
      : resultado.map((d) => d.__doc);
  };

  const api = {
    sort(ordem) { estado.ordem = ordem; return api; },
    limit(n) { estado.limite = n; return api; },
    skip(n) { estado.pular = n; return api; },
    lean() { estado.lean = true; return api; },
    select(campos) { estado.selecionar = campos; return api; },
    then(resolver, rejeitar) {
      try { return Promise.resolve(executar()).then(resolver, rejeitar); }
      catch (e) { return Promise.reject(e).then(resolver, rejeitar); }
    },
  };
  return api;
}

/**
 * Troca os métodos de banco de um model por versões em memória.
 *
 * @param Model      o model do Mongoose (Resposta ou Usuario)
 * @param opcoes.unicos  campos que não podem repetir (simula índice único)
 * @param opcoes.datas   campos de data, para reidratar após o JSON
 */
function instalar(Model, opcoes = {}) {
  const registros = []; // cada item: { __doc, __plano }
  const unicos = opcoes.unicos || [];
  const datas = opcoes.datas || [];

  const indiceDe = (id) => registros.findIndex((r) => String(r.__plano._id) === String(id));

  Model.prototype.save = async function () {
    await this.validate();

    if (!this._id) this._id = new mongoose.Types.ObjectId();

    // Simula o erro 11000 do MongoDB (valor duplicado em campo único)
    for (const campo of unicos) {
      const conflito = registros.find(
        (r) => r.__plano[campo] === this[campo] && String(r.__plano._id) !== String(this._id)
      );
      if (conflito) {
        const erro = new Error(`E11000 duplicate key error: ${campo}`);
        erro.code = 11000;
        throw erro;
      }
    }

    const plano = corrigirDatas(paraObjeto(this), datas);
    // O toObject não inclui campos com select:false, então copiamos à mão
    if (this.senhaHash) plano.senhaHash = this.senhaHash;

    const existente = indiceDe(this._id);
    const registro = { __doc: this, __plano: plano };

    if (existente >= 0) registros[existente] = registro;
    else registros.push(registro);

    return this;
  };

  Model.prototype.deleteOne = async function () {
    const i = indiceDe(this._id);
    if (i >= 0) registros.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  };

  Model.find = (filtro = {}) => consulta(() => registros, filtro, { datas });

  Model.findOne = (filtro = {}) => {
    const api = consulta(() => registros, filtro, { datas });
    const originalThen = api.then;
    api.then = (resolver, rejeitar) =>
      originalThen.call(api, (lista) => resolver(lista[0] || null), rejeitar);
    return api;
  };

  // findById precisa aceitar .select() encadeado, como o Mongoose de verdade.
  // Devolvemos um objeto que funciona tanto com await direto quanto com
  // .select('+senhaHash') antes do await.
  Model.findById = (id) => {
    const buscar = () => {
      const i = indiceDe(id);
      return i >= 0 ? registros[i].__doc : null;
    };
    const api = {
      select() { return api; }, // os documentos em memória já trazem tudo
      lean() {
        const doc = buscar();
        return Promise.resolve(doc ? corrigirDatas({ ...doc.toObject() }, datas) : null);
      },
      then(resolver, rejeitar) {
        return Promise.resolve(buscar()).then(resolver, rejeitar);
      },
    };
    return api;
  };

  Model.countDocuments = async (filtro = {}) =>
    registros.filter((r) => new Query(filtro).test(r.__plano)).length;

  Model.insertMany = async (lista) => {
    const criados = [];
    for (const item of lista) {
      const doc = new Model(item);
      await doc.save();
      criados.push(doc);
    }
    return criados;
  };

  // create() é atalho para "new Model(...) + save()". Precisa existir aqui,
  // senão a chamada cai no Mongoose de verdade e fica esperando uma conexão
  // que não existe nos testes.
  Model.create = async (dados) => {
    if (Array.isArray(dados)) return Model.insertMany(dados);
    const doc = new Model(dados);
    await doc.save();
    return doc;
  };

  // Só o suficiente para gravações de rodapé, como "marcar quando foi usado
  // pela última vez". Aceita campos soltos e $set; não implementa operadores
  // de incremento nem de array, que nenhuma rota daqui usa.
  Model.updateOne = async (filtro = {}, mudancas = {}) => {
    const alvo = registros.find((r) => new Query(filtro).test(r.__plano));
    if (!alvo) return { matchedCount: 0, modifiedCount: 0 };

    const campos = { ...mudancas, ...(mudancas.$set || {}) };
    delete campos.$set;
    Object.assign(alvo.__plano, campos);
    Object.assign(alvo.__doc, campos);
    return { matchedCount: 1, modifiedCount: 1 };
  };

  Model.findByIdAndDelete = async (id) => {
    const i = indiceDe(id);
    if (i < 0) return null;
    const [removido] = registros.splice(i, 1);
    return removido.__doc;
  };

  Model.aggregate = async (pipeline) => {
    const dados = registros.map((r) => corrigirDatas({ ...r.__plano }, datas));
    return new Aggregator(pipeline).run(dados);
  };

  Model.deleteMany = async (filtro = {}) => {
    const antes = registros.length;
    const manter = registros.filter((r) => !new Query(filtro).test(r.__plano));
    registros.length = 0;
    registros.push(...manter);
    return { deletedCount: antes - registros.length };
  };

  Model.__limpar = () => { registros.length = 0; };
  Model.__registros = registros;

  return Model;
}

module.exports = { instalar };
