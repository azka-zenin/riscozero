// preparar.js
// Monta o .env perguntando o que falta, em vez de exigir que alguém edite o
// arquivo à mão na manhã da apresentação.
//
//   npm run preparar
//
// POR QUE ISTO EXISTE: o .env não vai para o GitHub (é onde ficam as senhas),
// então todo computador novo começa sem ele. O caminho manual — copiar o
// .env.example, abrir num editor, gerar a chave JWT com um comando de uma
// linha, colar sem quebrar nada — tem quatro passos e cada um deles já deu
// errado em ensaio. Este script faz os quatro e confere o resultado.
//
// Não sobrescreve um .env que já existe sem perguntar.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const CAMINHO = path.join(__dirname, '.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Fila de linhas já digitadas e de perguntas ainda sem resposta.
//
// POR QUE NÃO USAR rl.question() DIRETO: encadeado, ele só entrega a primeira
// linha quando a entrada não vem de um terminal — o que quebra qualquer teste
// automatizado deste script e qualquer uso via pipe. Ouvindo o evento "line"
// e guardando o que chega, os dois casos funcionam igual.
const linhas = [];
const esperando = [];
let entradaAcabou = false;

rl.on('line', (linha) => {
  if (esperando.length > 0) esperando.shift()(linha);
  else linhas.push(linha);
});

rl.on('close', () => {
  entradaAcabou = true;
  // Solta quem estava esperando, para o script terminar em vez de pendurar.
  while (esperando.length > 0) esperando.shift()('');
});

function perguntar(texto) {
  process.stdout.write(texto);
  if (linhas.length > 0) return Promise.resolve(linhas.shift());
  if (entradaAcabou) return Promise.resolve('');
  return new Promise((resolve) => esperando.push(resolve));
}

/** Pergunta até vir uma resposta que sirva, em vez de gravar algo quebrado. */
async function pedirAte(texto, validar, padrao = null) {
  for (;;) {
    const bruto = (await perguntar(texto)).trim();
    const valor = bruto === '' && padrao !== null ? padrao : bruto;
    const problema = validar(valor);
    if (!problema) return valor;

    // Sem isto, uma entrada que acabou no meio (Ctrl+D, ou um pipe curto)
    // repetiria a mesma pergunta para sempre.
    if (entradaAcabou) {
      console.log(`\n  ${problema}`);
      console.log('  A entrada acabou antes de o .env ficar pronto. Nada foi gravado.\n');
      process.exit(1);
    }
    console.log(`  ${problema}\n`);
  }
}

function validarURI(valor) {
  if (!valor) return 'Precisa preencher — sem o endereço do banco o sistema não sobe.';
  if (!valor.startsWith('mongodb://') && !valor.startsWith('mongodb+srv://')) {
    return 'O endereço deve começar com "mongodb+srv://" (Atlas) ou "mongodb://" (local).';
  }
  // O erro mais comum: copiar a string do Atlas e esquecer de trocar <password>
  if (valor.includes('<password>') || valor.includes('<senha>')) {
    return 'Troque <password> pela senha real do usuário do banco antes de continuar.';
  }
  return null;
}

(async () => {
  console.log('\n  Preparando o RiscoZero neste computador.\n');

  if (fs.existsSync(CAMINHO)) {
    const r = (await perguntar('  Já existe um .env aqui. Substituir? (s/N) ')).trim().toLowerCase();
    if (r !== 's') {
      console.log('\n  Nada mudou. Rode "npm run verificar" para testar o .env atual.\n');
      rl.close();
      return;
    }
    console.log('');
  }

  console.log('  O endereço do banco está no MongoDB Atlas, em:');
  console.log('  Database > Connect > Drivers > copie a string de conexão.\n');

  const uri = await pedirAte('  Endereço do MongoDB: ', validarURI);

  console.log('');
  const email = await pedirAte(
    '  E-mail do administrador [admin@riscozero.local]: ',
    (v) => (v.includes('@') ? null : 'Precisa ser um e-mail.'),
    'admin@riscozero.local',
  );

  const senha = await pedirAte(
    '  Senha do administrador (mínimo 8 caracteres): ',
    (v) => (v.length >= 8 ? null : 'Curta demais — use pelo menos 8 caracteres.'),
  );

  const nome = (await perguntar('  Nome do administrador [Administrador]: ')).trim() || 'Administrador';

  // Gerada aqui, e não pedida: ninguém precisa ver nem digitar esta chave.
  // 48 bytes em hexadecimal dão 96 caracteres, muito acima do mínimo exigido
  // pelo middleware/auth.js.
  const jwt = crypto.randomBytes(48).toString('hex');

  const conteudo = `# Gerado por "npm run preparar" em ${new Date().toLocaleString('pt-BR')}.
# Este arquivo tem senhas: ele NÃO vai para o GitHub (está no .gitignore).
# As variáveis opcionais estão documentadas em .env.example.

MONGODB_URI=${uri}

JWT_SECRET=${jwt}

PORT=3000

ADMIN_EMAIL=${email}
ADMIN_SENHA=${senha}
ADMIN_NOME=${nome}
`;

  // 0600: só o dono do arquivo lê. Num computador compartilhado — laboratório
  // da escola, por exemplo — o padrão deixaria a senha do banco legível para
  // qualquer conta da máquina.
  fs.writeFileSync(CAMINHO, conteudo, { mode: 0o600 });

  console.log('\n  .env criado.\n');
  console.log('  Agora, nesta ordem:\n');
  console.log('    npm run verificar    confere se o banco responde');
  console.log('    npm run seed         cria o administrador e dados de exemplo');
  console.log('    npm start            sobe o sistema em http://localhost:3000\n');
  console.log('  Se o "verificar" falhar por causa do endereço, rode este script de novo.\n');

  rl.close();
})();
