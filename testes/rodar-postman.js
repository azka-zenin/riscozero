// testes/rodar-postman.js
// Executa todas as requisições da coleção do Postman contra o servidor,
// conferindo se os status esperados batem.
//
//   node testes/rodar-postman.js
//
// POR QUE ISTO EXISTE: uma coleção do Postman é documentação — e documentação
// que não confere com o sistema é pior do que documentação nenhuma. Este script
// garante que cada requisição descrita ali realmente funciona.
//
// Requer o servidor no ar. Para testar sem MongoDB, rode antes:
//   node testes/servidor-demo.js

const fs = require('fs');
const path = require('path');

const colecao = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'postman', 'RiscoZero.postman_collection.json'), 'utf8')
);

// Status esperado por requisição (as marcadas "deve falhar" esperam erro)
const ESPERADO = {
  'Verificar se está no ar': 200,
  'Risco por turno': 200,
  'Listar acessos': 200,
  'Resumo do histórico': 200,
  'Login': 200,
  'Login com senha errada (deve falhar)': 401,
  'Quem sou eu': 200,
  'Sair': 200,
  'Enviar resposta': 201,
  'Enviar com setor inválido (deve falhar)': 400,
  'Enviar com nota fora da escala (deve falhar)': 400,
  'Resumo': 200,
  'Marcar ação pós-alerta': 201,
  'Resumo sem token (deve falhar)': 401,
  'Evolução': 200,
  'Risco por turno': 200,
  'Comentários': 200,
  'Listar respostas': 200,
  'Exportar CSV': 200,
  'Criar conta': 201,
  'Listar contas': 200,
  'Detalhar conta': 200,
  'Atualizar conta': 200,
  'Remover conta': 200,
};

const variaveis = {};
colecao.variable.forEach((v) => { variaveis[v.key] = v.value; });

// Credenciais do servidor de demonstração
variaveis.email = process.env.EMAIL_TESTE || 'pedro@ceeppg.br';
variaveis.senha = process.env.SENHA_TESTE || 'senha123';
variaveis.baseUrl = process.env.BASE_URL || 'http://localhost:3000';

function substituir(texto) {
  if (!texto) return texto;
  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave) => variaveis[chave] ?? '');
}

let passou = 0;
let falhou = 0;
const problemas = [];

async function executar(item, pasta) {
  const req = item.request;
  const url = substituir(req.url.raw);

  const headers = {};
  (req.header || []).forEach((h) => { headers[h.key] = substituir(h.value); });

  const corpo = req.body?.raw ? substituir(req.body.raw) : undefined;

  const resposta = await fetch(url, { method: req.method, headers, body: corpo });

  const esperado = ESPERADO[item.name];
  const bateu = resposta.status === esperado;

  if (bateu) {
    passou++;
    console.log(`  OK    ${item.name} (${resposta.status})`);
  } else {
    falhou++;
    problemas.push(`${pasta} > ${item.name}: esperado ${esperado}, veio ${resposta.status}`);
    console.log(`  FALHA ${item.name} — esperado ${esperado}, veio ${resposta.status}`);
  }

  // Guarda token e id, como fazem os scripts de teste da própria coleção
  const tipo = resposta.headers.get('content-type') || '';
  if (tipo.includes('json')) {
    const dados = await resposta.json();
    if (dados.token) variaveis.token = dados.token;
    if (dados.usuario?.id) variaveis.usuarioId = dados.usuario.id;

    // Confere que nenhuma resposta vaza hash de senha
    const texto = JSON.stringify(dados);
    if (texto.includes('senhaHash') || texto.includes('$2b$') || texto.includes('$2a$')) {
      falhou++;
      problemas.push(`${item.name}: VAZOU hash de senha na resposta`);
      console.log(`  FALHA ${item.name} — vazou hash de senha`);
    }
  }
}

(async () => {
  console.log(`\nRodando a coleção contra ${variaveis.baseUrl}\n`);

  try {
    await fetch(variaveis.baseUrl);
  } catch {
    console.error('Servidor não respondeu. Suba com "npm start" ou "node testes/servidor-demo.js".\n');
    process.exit(1);
  }

  for (const pasta of colecao.item) {
    console.log(`=== ${pasta.name} ===`);
    for (const item of pasta.item) {
      // "Sair" invalidaria a sessão no meio da bateria; testamos por último
      // "Sair" invalidaria a sessao no meio da bateria e "Trocar a propria
      // senha" mudaria a senha usada pelos proximos testes.
      if (item.name === 'Sair' || item.name === 'Trocar a própria senha') continue;
      await executar(item, pasta.name);
    }
    console.log('');
  }

  // Agora sim, o logout. Procuramos pelo nome em todas as pastas em vez de
  // assumir posição fixa — a ordem das pastas na coleção pode mudar.
  console.log('=== Encerramento ===');
  const sair = colecao.item
    .flatMap((pasta) => pasta.item)
    .find((i) => i.name === 'Sair');

  if (sair) await executar(sair, 'Autenticação');
  else console.log('  (requisição "Sair" não encontrada na coleção)');

  console.log('\n' + '='.repeat(52));
  console.log(`  ${passou} passaram, ${falhou} falharam`);
  if (problemas.length) {
    console.log('\n  Problemas:');
    problemas.forEach((p) => console.log(`    - ${p}`));
  }
  console.log('='.repeat(52) + '\n');

  process.exit(falhou > 0 ? 1 : 0);
})();
