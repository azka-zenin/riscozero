# O que mudou na migração para MongoDB

Documento de apoio para a equipe entender a troca de banco e conseguir explicar
as decisões. Se você só quer rodar o sistema, veja o `LEIA-ME.md`.

---

## Resumo

| | Antes (v2.0) | Agora (v3.0) |
|---|---|---|
| Banco | SQLite (arquivo local) | MongoDB Atlas (nuvem) |
| Estrutura | Tabela com colunas fixas | Coleção de documentos |
| Consultas | SQL (`SELECT`, `GROUP BY`) | Aggregation pipelines |
| Login | Uma senha para todos | Conta individual por pessoa |
| Senha | Texto puro no `config.js` | Hash bcrypt no banco |
| Sessão | Lista na memória do servidor | Token JWT assinado |
| Permissões | Não existiam | Admin e gestor |

O código da versão SQLite não foi preservado neste repositório Git — o
commit inicial já chega com o esqueleto em MongoDB (v4.0). Este documento
existe para explicar a troca de banco caso a banca pergunte, não para
recuperar o código antigo.

---

## Tabela vira coleção

No SQLite, a estrutura era declarada no `CREATE TABLE` e o banco recusava o que
não encaixasse. O MongoDB aceita qualquer formato — o que é flexível, mas
perigoso: um erro de digitação criaria um campo novo em vez de dar erro.

Por isso usamos **Mongoose**, que permite declarar o formato esperado. Os
arquivos em `models/` cumprem hoje o papel que o `CREATE TABLE` cumpria antes.

**Antes:**

```sql
CREATE TABLE respostas (
  id INTEGER PRIMARY KEY,
  setor TEXT NOT NULL,
  estresse INTEGER NOT NULL,
  ...
)
```

**Agora** (`models/Resposta.js`, resumido):

```js
const respostaSchema = new mongoose.Schema({
  setor: { type: String, required: true, enum: Object.keys(SETORES) },
  estresse: { type: Number, required: true, min: 1, max: 5 },
  ...
});
```

Ganho real: o `enum` recusa setores inexistentes automaticamente. Antes isso era
uma verificação escrita à mão na rota — que podia ser esquecida em algum caminho.

---

## SQL vira aggregation pipeline

Esta é a parte que mais mudou. Um `GROUP BY` do SQL vira um **pipeline**: uma
lista de etapas, onde a saída de uma é a entrada da próxima.

**Antes:**

```sql
SELECT setor,
       COUNT(*) as total,
       AVG(estresse) as media_estresse
FROM respostas
WHERE data_envio >= date('now', '-29 days')
GROUP BY setor
ORDER BY setor
```

**Agora:**

```js
Resposta.aggregate([
  { $match: { data_envio: { $gte: corte } } },   // equivale ao WHERE
  { $group: {                                    // equivale ao GROUP BY
      _id: '$setor',
      total: { $sum: 1 },                        // equivale ao COUNT(*)
      media_estresse: { $avg: '$estresse' },     // equivale ao AVG()
  }},
  { $sort: { _id: 1 } },                         // equivale ao ORDER BY
]);
```

A tradução é quase direta:

| SQL | MongoDB |
|---|---|
| `WHERE` | `$match` |
| `GROUP BY` | `$group` com `_id` |
| `COUNT(*)` | `{ $sum: 1 }` |
| `AVG(campo)` | `{ $avg: '$campo' }` |
| `ORDER BY` | `$sort` |
| `LIMIT` | `$limit` |

Detalhe que confunde: o campo agrupado sempre se chama `_id` no resultado, não
`setor`. Por isso existe a função `comoSetor()` em `routes/respostas.js`,
convertendo para o nome que o front-end espera.

---

## A armadilha do fuso horário

**Este foi um problema real que quase passou despercebido.**

O SQLite tinha `datetime('now', 'localtime')` — gravava no horário local. O
MongoDB guarda **sempre em UTC**.

O Brasil está 3 horas atrás do UTC. Uma resposta enviada às 22h do dia 7 vira
01h do dia 8 em UTC. Ao agrupar por dia sem informar o fuso, ela apareceria no
dia errado no gráfico de evolução — e ninguém entenderia o porquê dos picos
estranhos.

A correção é o parâmetro `timezone`:

```js
$dateToString: {
  format: '%Y-%m-%d',
  date: '$data_envio',
  timezone: 'America/Sao_Paulo',   // sem isso, agrupa por dia em UTC
}
```

O fuso fica em `config.js`, num lugar só.

---

## Login: de senha única para contas

**Antes:** uma senha (`ceep2026`) escrita no `config.js`, compartilhada por
todos. Dois problemas: quem abrisse o arquivo via a senha, e não havia como
saber quem acessou.

**Agora:** cada pessoa tem conta própria, com senha em hash.

### O que é um hash

Em vez de gravar `senha123`, gravamos o resultado de uma conta matemática que só
funciona em um sentido. Dá para verificar se a senha digitada gera o mesmo
resultado, mas não dá para voltar do resultado até a senha. Se o banco vazar, as
senhas continuam protegidas.

Usamos **bcrypt**, que é lento de propósito — isso também torna lento o trabalho
de quem tentar adivinhar senhas por força bruta.

### O que é JWT

Antes, o servidor guardava numa lista quem estava logado. Reiniciar o servidor
desconectava todo mundo.

Agora o servidor gera um token que **carrega dentro dele** quem é o usuário, e o
assina com uma chave secreta. Para conferir, basta verificar a assinatura — nada
fica guardado.

Se alguém tentar editar o token (por exemplo, trocar o papel para `admin`), a
assinatura deixa de bater e o acesso é negado. Testamos isso: veja os testes de
adulteração em `testes/`.

**Limitação assumida:** como nada fica guardado, não dá para invalidar um token
antes de ele expirar. Por isso o prazo é curto — 8 horas.

---

## Como testamos sem um MongoDB instalado

O `npm test` roda **sem precisar de banco**. Os testes substituem apenas a
camada que grava e lê (`testes/mongo-falso.js`), mantendo os models do Mongoose
intactos — ou seja, as validações e as regras testadas são as mesmas do sistema
real. As agregações rodam pela biblioteca `mingo`, que implementa os mesmos
operadores do MongoDB em JavaScript.

Isso permite rodar os testes em qualquer computador, sem internet.

**Mas isso não prova que o Atlas está configurado certo.** Para isso existe o
`npm run verificar`, que usa o banco de verdade. Rode ao trocar de computador e
antes de apresentar.

---

## Dois bugs que os testes encontraram

Vale citar na apresentação — mostra que o processo funcionou.

**1. Conta de administrador desativada ficava presa.**
A trava que impede remover "o último administrador" não distinguia contas ativas
de desativadas. Um admin já desativado (que nem consegue entrar) contava para o
total, então não podia ser removido nunca. Corrigido para considerar apenas
administradores **ativos**.

**2. Gráficos não encolhiam ao redimensionar a janela.**
Descoberto ainda na versão anterior: o canvas mantinha a largura antiga e
empurrava a página para o lado no celular, sem nunca se ajustar. A correção foi
envolver cada gráfico num container com altura própria — sem isso, o Chart.js
media o tamanho errado e achava que já cabia.

---

## Arquivos que mudaram

| Arquivo | O que aconteceu |
|---|---|
| `database.js` | Reescrito com Mongoose |
| `models/` | **Novo** — Resposta e Usuario |
| `routes/respostas.js` | Queries SQL viraram aggregation |
| `routes/usuarios.js` | **Novo** — o CRUD |
| `routes/auth.js` | Login por e-mail e senha |
| `middleware/auth.js` | Token em memória virou JWT |
| `config.js` | Saiu a senha, entrou o fuso horário |
| `seed.js` / `limpar.js` | Adaptados; o seed cria o primeiro admin |
| `server.js` | Só sobe depois que o banco conecta |
| `public/login.html` | Ganhou campo de e-mail |
| `public/usuarios.html` | **Novo** — tela do CRUD |
| `utils/analise.js` | Praticamente inalterado |
| `public/index.html` | Inalterado |

O `utils/analise.js` quase não mudou porque ele recebe números já calculados e
não sabe de onde vieram. Separar a lógica de negócio do acesso ao banco poupou
trabalho na migração — vale citar isso se perguntarem sobre organização de código.
