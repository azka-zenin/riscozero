// utils/seed-por-ambiente.js
//
// Popula o banco na subida quando a hospedagem não tem shell para rodar
// "npm run seed". Só age se SEED_DEMO=true E o banco de respostas estiver
// vazio, então reiniciar o serviço não duplica os dados.
//
// COMO USAR: no painel da hospedagem, defina SEED_DEMO=true (e, se quiser,
// ADMIN_EMAIL e ADMIN_SENHA) e suba o serviço. Depois da primeira subida,
// troque SEED_DEMO para false — os dados já ficam no banco.

const { Resposta } = require('../models/Resposta');
const { criarAdmin, gerarRespostas } = require('../seed');

async function semearPorAmbiente() {
  if (process.env.SEED_DEMO !== 'true') return;

  const existentes = await Resposta.countDocuments();
  if (existentes > 0) {
    console.log(`  SEED_DEMO: banco já tem ${existentes} respostas — nada a fazer.`);
    return;
  }

  console.log('  SEED_DEMO: banco vazio, populando dados de demonstração...');
  await criarAdmin();
  await gerarRespostas();
  console.log('  SEED_DEMO: pronto. Defina SEED_DEMO=false no painel.');
}

module.exports = { semearPorAmbiente };
