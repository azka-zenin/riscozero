# 🎬 CHECKLIST PRÉ-APRESENTAÇÃO — TERÇA PELA MANHÃ

**Hora recomendada:** 30 minutos antes da apresentação começar

---

## ✅ PASSO 1: Preparar o `.env` (5 min)

### 1.1 Copiar o template:

```bash
cp .env.example .env
```

### 1.2 Preencher `MONGODB_URI`

Peça o link do MongoDB Atlas à pessoa que configurou o banco:

```
MONGODB_URI=mongodb+srv://USUARIO:SENHA@cluster.mongodb.net/riscozero
```

**⚠️ IMPORTANTE:** Troque `USUARIO` e `SENHA` pelos dados reais.

### 1.3 Gerar `JWT_SECRET`

Rode este comando:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copie o resultado e cole no `.env`:

```
JWT_SECRET=cole_aqui_o_resultado
```

### 1.4 Credencial do primeiro admin (opcional, mas recomendado)

```
ADMIN_EMAIL=admin@riscozero.local
ADMIN_SENHA=trocar-esta-senha
ADMIN_NOME=Administrador
```

**Depois da apresentação, troque a senha pelo painel.**

---

## ✅ PASSO 2: Instalar e validar (5 min)

### 2.1 Instalar dependências (se ainda não fez):

```bash
npm install
```

### 2.2 Verificar conexão com MongoDB:

```bash
npm run verificar
```

**Esperado:**
```
✓ MONGODB_URI preenchida
✓ JWT_SECRET preenchida
✓ Conexão com MongoDB bem-sucedida
```

Se falhar, verifique:
- O `.env` está realmente preenchido
- A internet tá conectada
- O MongoDB Atlas tá rodando (não foi pausado)
- O IP do seu computador está liberado no Atlas

### 2.3 Rodar os testes (valida que o código tá 100%):

```bash
npm test
```

**Esperado:** `156 testes passaram, 0 falharam`

---

## ✅ PASSO 3: Popular dados de demonstração (2 min)

```bash
npm run seed
```

Isto cria:
- 1 conta admin com email/senha do `.env`
- ~200 respostas fictícias nos últimos 30 dias
- Dados suficientes pro painel mostrar gráficos, alertas, recomendações

**Depois disso, o painel tá cheio de dados.** Se alguém do grupo clicou em "Marcar ação tomada" durante ensaio:

```bash
npm run limpar
npm run seed
```

Isto reseta tudo (sem afetar as contas).

---

## ✅ PASSO 4: Ligar o servidor (1 min)

```bash
npm start
```

**Esperado:**

```
RiscoZero no ar em http://localhost:3000
Conectado ao MongoDB em: mongodb+srv://...
```

---

## ✅ PASSO 5: Abrir 3 abas no navegador (1 min)

Deixa abertas:

1. **Formulário:** http://localhost:3000
2. **Dashboard:** http://localhost:3000/dashboard.html
3. **Gerenciamento de contas:** http://localhost:3000/usuarios.html

Testa o login nelas pra garantir que funciona.

---

## ✅ PASSO 6: Testar o fluxo da apresentação (5 min)

### Teste 1: Preencher o formulário (aba 1)

- Abra a aba 1 (formulário)
- Setor: Produção
- Turno: Manhã
- Estresse: 5
- Sono: 1
- Carga: 4
- Ambiente: 3
- Comentário: "Sistema teste, apagar depois"
- Clique "Enviar"

**Esperado:** "Obrigado! Resposta gravada."

### Teste 2: Fazer login (aba 2)

- Abra a aba 2 (dashboard)
- Email: admin@riscozero.local
- Senha: trocar-esta-senha
- Clique "Entrar"

**Esperado:** Painel abre com gráficos.

### Teste 3: Ver os dados aparecerem

- Aguarde alguns segundos
- Verifique:
  - Alertas aparecem no topo (em vermelho ou âmbar)
  - Gráfico de evolução mostra dados
  - Risco por setor é visível
  - Risco por turno tá preenchido
  - Recomendações aparecem

Se nada aparecer: `npm run seed` de novo e espere 5s pra painel atualizar.

### Teste 4: Clicar em "Marcar ação tomada"

- Clique em um dos cartões de recomendação
- "Marcar ação tomada" deve ficar destacado

**Depois disso não limpa o painel!** Se quiser fazer demo de novo:

```bash
npm run limpar
npm run seed
```

### Teste 5: Ir pra aba 3 (contas)

- Clique em "Gerenciamento de contas"
- Verifique que sua conta está listada
- Verifique que **seu próprio e-mail NÃO tem botão de remover**

---

## 🚨 PLANO B: Se a internet cair

**O banco fica na nuvem, então sem internet o sistema não sobe no modo normal.**

Se isso acontecer na hora, rode:

```bash
node testes/servidor-demo.js
```

Isto ativa um banco em **memória** com dados de exemplo. As telas são **exatamente iguais**. A banca não vai saber.

---

## ❌ Troubleshooting Rápido

| Erro | Solução |
|---|---|
| `Cannot find module 'dotenv'` | `npm install` não foi rodado. Rode: `npm install` |
| `MONGODB_URI preenchida no .env` | `.env` vazio. Verifique que preencheu com a URI real |
| `Connection refused` ou `ECONNREFUSED` | MongoDB Atlas pode estar down. Verifique no seu navegador se consegue acessar o Atlas |
| `Erro: porta 3000 em uso` | Outro servidor rodando. Feche o outro terminal ou rode em outra porta: `PORT=3001 npm start` |
| `Painel não atualiza / mostra "Desconectado"` | Recarregue a página (F5). Se persistir, reinicie o servidor: `Ctrl+C` + `npm start` |
| `Botões não funcionam` | Limpe cache do navegador (Ctrl+Shift+Delete ou Cmd+Shift+Delete) e recarregue |

---

## 📝 Resumo Final

1. ✅ `.env` preenchido (MONGODB_URI + JWT_SECRET)
2. ✅ `npm install`
3. ✅ `npm run verificar` passou
4. ✅ `npm run seed` rodado
5. ✅ `npm test` passou (156 testes)
6. ✅ `npm start` servidor ligado
7. ✅ 3 abas do navegador abertas
8. ✅ Fluxo testado (formulário → login → painel)
9. ✅ Alguém sabe o plano B offline

---

## 🎯 Na hora da apresentação

- **Não feche o terminal do servidor** (vai derrubar o painel)
- **Cliques lentos** (deixa a banca ver o que tá acontecendo)
- **Se algo travar:** Ctrl+C no terminal, `npm start` de novo
- **Se a internet cair:** `node testes/servidor-demo.js`

---

**Boa sorte! Vocês têm um projeto sólido. 🚀**
