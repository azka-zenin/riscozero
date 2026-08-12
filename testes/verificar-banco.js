// testes/verificar-banco.js
// Confere se a conexão com o MongoDB de verdade está funcionando e se as
// consultas do painel devolvem o que deveriam.
//
//   npm run verificar
//
// POR QUE ISTO EXISTE, ALÉM DO "npm test":
// O "npm test" roda com um banco simulado em memória — ele valida a lógica do
// sistema, mas não prova que o MongoDB Atlas está configurado certo. Este
// script faz o caminho contrário: usa o banco de verdade, do jeito que ele vai
// funcionar na apresentação.
//
// Rode este comando depois de preencher o .env, e sempre que trocar de
// computador. Ele grava e apaga um registro de teste, sem mexer nos seus dados.

require('dotenv').config();

const { conectar, desconectar, mongoose } = require('../database');
const { Resposta } = require('../models/Resposta');
const { Usuario } = require('../models/Usuario');
const config = require('../config');

let passou = 0;
let falhou = 0;

function ok(nome, condicao, detalhe = '') {
  if (condicao) {
    passou++;
    console.log(`  OK    ${nome}`);
  } else {
    falhou++;
    console.log(`  FALHA ${nome}${detalhe ? ' -> ' + detalhe : ''}`);
  }
}

(async () => {
  console.log('\nVerificando a ligação com o MongoDB...\n');

  // -------------------------------------------------------------------------
  console.log('=== CONFIGURAÇÃO ===');

  ok('MONGODB_URI preenchida no .env', !!process.env.MONGODB_URI,
    'copie .env.example para .env e preencha');
  ok('JWT_SECRET preenchida no .env', !!process.env.JWT_SECRET,
    'gere com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');

  if (!process.env.MONGODB_URI) {
    console.log('\nSem o endereço do banco não dá para continuar.\n');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  console.log('\n=== CONEXÃO ===');

  try {
    await conectar();
    ok('conectou no MongoDB', mongoose.connection.readyState === 1);
    ok('banco tem nome definido', !!mongoose.connection.name, mongoose.connection.name);
  } catch (erro) {
    ok('conectou no MongoDB', false, erro.message);
    console.log('\nDicas para resolver:');
    console.log('  - Confira se a senha na MONGODB_URI está correta');
    console.log('  - No Atlas, veja se o seu IP está liberado em "Network Access"');
    console.log('  - Confirme que há internet nesta máquina\n');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  console.log('\n=== GRAVAR E LER ===');

  let idTeste = null;
  try {
    const teste = new Resposta({
      setor: 'TI',
      turno: 'Manha',
      estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3,
      comentario: 'Registro de verificação — pode apagar',
    });
    await teste.save();
    idTeste = teste._id;
    ok('gravou um registro de teste', !!idTeste);

    const lido = await Resposta.findById(idTeste);
    ok('leu o registro de volta', !!lido && lido.setor === 'TI');
    ok('data gravada corretamente', lido.data_envio instanceof Date);
  } catch (erro) {
    ok('gravou um registro de teste', false, erro.message);
  }

  // -------------------------------------------------------------------------
  console.log('\n=== VALIDAÇÕES ===');

  try {
    await new Resposta({
      setor: 'SetorQueNaoExiste',
      turno: 'Manha',
      estresse: 3, sono: 3, carga_trabalho: 3, ambiente_fisico: 3,
    }).save();
    ok('setor inválido é recusado', false, 'o banco aceitou um setor inexistente');
  } catch (erro) {
    ok('setor inválido é recusado', erro.name === 'ValidationError');
  }

  try {
    await new Resposta({
      setor: 'TI', turno: 'Manha', estresse: 99, sono: 3, carga_trabalho: 3, ambiente_fisico: 3,
    }).save();
    ok('nota fora da escala é recusada', false, 'o banco aceitou nota 99');
  } catch (erro) {
    ok('nota fora da escala é recusada', erro.name === 'ValidationError');
  }

  // -------------------------------------------------------------------------
  console.log('\n=== CONSULTAS DO PAINEL ===');

  try {
    const porSetor = await Resposta.aggregate([
      {
        $group: {
          _id: '$setor',
          total: { $sum: 1 },
          media_estresse: { $avg: '$estresse' },
          media_sono: { $avg: '$sono' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    ok('agrupamento por setor funciona', Array.isArray(porSetor), `${porSetor.length} setor(es)`);
    ok('médias calculadas',
      porSetor.length === 0 || typeof porSetor[0].media_estresse === 'number');
  } catch (erro) {
    ok('agrupamento por setor funciona', false, erro.message);
  }

  try {
    // Esta é a consulta mais sensível: se o fuso não for aplicado, respostas do
    // fim da tarde aparecem no dia seguinte no gráfico de evolução.
    const porDia = await Resposta.aggregate([
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$data_envio',
              timezone: config.FUSO_HORARIO,
            },
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    ok('agrupamento por dia funciona', Array.isArray(porDia), `${porDia.length} dia(s)`);
    ok(`fuso ${config.FUSO_HORARIO} aceito pelo servidor`,
      porDia.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(porDia[0]._id),
      porDia.length ? porDia[0]._id : 'sem dados');
  } catch (erro) {
    ok('agrupamento por dia funciona', false, erro.message);
  }

  // -------------------------------------------------------------------------
  console.log('\n=== CONTAS DE ACESSO ===');

  const totalUsuarios = await Usuario.countDocuments();
  ok('coleção de usuários acessível', typeof totalUsuarios === 'number', `${totalUsuarios} conta(s)`);

  const admins = await Usuario.countDocuments({ papel: 'admin', ativo: true });
  ok('existe ao menos um administrador ativo', admins > 0,
    admins === 0 ? 'rode "npm run seed" para criar o primeiro' : `${admins} admin(s)`);

  // -------------------------------------------------------------------------
  console.log('\n=== LIMPEZA ===');

  if (idTeste) {
    await Resposta.findByIdAndDelete(idTeste);
    const sumiu = !(await Resposta.findById(idTeste));
    ok('registro de teste removido', sumiu);
  }

  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(52));
  console.log(`  ${passou} passaram, ${falhou} falharam`);
  if (falhou === 0) {
    console.log('  O banco está pronto. Pode subir com "npm start".');
  } else {
    console.log('  Resolva os pontos acima antes de usar o sistema.');
  }
  console.log('='.repeat(52) + '\n');

  await desconectar();
  process.exit(falhou > 0 ? 1 : 0);
})().catch(async (erro) => {
  console.error('\nErro inesperado:', erro.message, '\n');
  try { await desconectar(); } catch {}
  process.exit(1);
});
