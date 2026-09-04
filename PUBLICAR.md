# Publicar o RiscoZero na internet

Guia para colocar o sistema num endereço público, acessível de qualquer
computador — sem depender da máquina de quem for apresentar.

**Custo: R$ 0,00.** Tanto o Render quanto o MongoDB Atlas têm plano gratuito
suficiente para este projeto.

---

## Antes de começar

- [ ] Projeto no GitHub (repositório privado serve)
- [ ] MongoDB Atlas já configurado e funcionando (`npm run verificar` passando)
- [ ] A connection string do Atlas em mãos
- [ ] **O código que você quer publicar está no branch `main`**

> **Sobre o último item:** o Render acompanha um branch só — o `main`. Se o
> trabalho recente está num branch separado, ele não vai ao ar enquanto não
> for integrado ao `main`. É a causa mais comum de "publiquei e está faltando
> coisa": o deploy funcionou, só que da versão antiga.

---

## 1. Liberar o acesso do Render no Atlas

O Atlas só aceita conexões de endereços liberados. Hoje o seu computador está
liberado, mas o servidor do Render não.

1. No Atlas, vá em **Network Access**
2. Clique em **Add IP Address**
3. Escolha **Allow access from anywhere** (`0.0.0.0/0`)
4. Confirme

> **Isso é seguro?** Libera o endereço, não o acesso: quem chegar ainda precisa
> da senha do banco. Serviços gratuitos como o Render não têm endereço fixo, e
> por isso essa é a configuração que eles próprios recomendam. Se um dia o
> projeto virar algo sério, o caminho seria migrar para um plano com endereço
> fixo e liberar só ele.

---

## 2. Criar o serviço no Render

1. Entre em [render.com](https://render.com) e crie a conta (dá para usar a do GitHub)
2. Clique em **New** → **Blueprint**
3. Conecte a sua conta do GitHub e escolha o repositório do RiscoZero
4. O Render lê o arquivo `render.yaml` do projeto e monta o serviço sozinho
5. Ele vai pedir o valor de **MONGODB_URI** — cole a connection string do Atlas
   (a mesma do seu `.env`, com a senha real)
6. Clique em **Apply**

O `JWT_SECRET` é gerado pelo próprio Render, então essa chave nunca passa por
e-mail nem por mensagem.

A primeira publicação leva alguns minutos. Quando terminar, o Render mostra o
endereço, algo como `https://riscozero.onrender.com`.

---

## 3. Criar a conta de administrador

O `render.yaml` não cria conta nenhuma, e o painel exige login. Como o Render
e a sua máquina apontam para o **mesmo banco no Atlas**, a conta criada aqui
vale lá também:

```bash
npm run seed
```

Isso usa o `ADMIN_EMAIL` e o `ADMIN_SENHA` do seu `.env` local e cria a conta
direto no Atlas. Faça isso **uma vez**; depois é só entrar pelo endereço
público com o mesmo e-mail e senha.

> Se rodar o `seed` de novo mais tarde, ele recria as ~200 respostas de
> exemplo. Para limpar só os dados sem mexer nas contas: `npm run limpar`.

Troque a senha do administrador pelo próprio painel assim que entrar — a que
está no `.env` foi escolhida para a instalação, não para o dia a dia.

---

## 4. Conferir se funcionou

Abra no navegador:

| Endereço | O que deve aparecer |
|---|---|
| `https://SEU-ENDERECO.onrender.com/api/saude` | `{"ok":true,"banco":"conectado", ...}` |
| `https://SEU-ENDERECO.onrender.com` | O formulário |
| `https://SEU-ENDERECO.onrender.com/login.html` | A tela de entrada |

Se `/api/saude` responder `"banco":"sem conexão"`, o problema está na conexão
com o Atlas — confira a senha na `MONGODB_URI` e se o acesso de rede foi
liberado no passo 1.

---

## 5. O detalhe mais importante para a apresentação

**No plano gratuito, o Render coloca o serviço para dormir depois de 15 minutos
sem ninguém acessar.** O primeiro acesso depois disso demora de 30 a 60
segundos para responder, porque o serviço precisa acordar.

Numa apresentação, isso significa uma tela em branco carregando bem na hora em
que a banca está olhando.

**Como evitar:** abra o endereço **uns 5 minutos antes** de apresentar, deixe
carregar, e mantenha a aba aberta. O sistema fica acordado enquanto houver
acesso.

Coloque isso no checklist do grupo. É a falha mais provável do dia.

---

## 6. Atualizar depois de mudar o código

O Render acompanha o repositório. Todo `git push` para o **branch `main`**
dispara uma nova publicação automaticamente — não precisa fazer nada no painel
deles.

Trabalho feito em outro branch não publica sozinho: precisa ser integrado ao
`main` primeiro. Depois de integrar, acompanhe a aba **Events** no Render para
ver a nova publicação subir.

Para acompanhar: no Render, aba **Logs** mostra o que está acontecendo, e
**Events** mostra o histórico de publicações.

---

## Plano B: e se o link não funcionar no dia?

Tenham os três caminhos prontos, do mais completo ao mais simples:

1. **Link publicado** — o normal
2. **Rodar localmente** com `npm start` (precisa de internet só para o banco)
3. **Modo demonstração** com `node testes/servidor-demo.js` — funciona sem
   internet nenhuma, com dados de exemplo. As telas são exatamente as mesmas.

E, como último recurso, capturas de tela salvas no celular de alguém.

---

## Resumo dos endereços e senhas

Anote em lugar seguro (não no grupo de mensagens):

| O quê | Onde fica |
|---|---|
| Endereço público | Painel do Render |
| Usuário e senha do banco | Atlas → Database Access |
| Conta de administrador do painel | Criada pelo `npm run seed` |
| Chave JWT | Gerada pelo Render, não precisa saber |

---

## Depois que estiver no ar

Duas coisas passam a funcionar no endereço público, e nenhuma delas precisa
estar ligada para a apresentação:

**Chaves de análise** (`/chaves.html`, só administrador). Criam o acesso de
leitura para o Power BI buscar os dados sozinho. Passo a passo em
`docs/POWER-BI.md`.

**Avisos automáticos para o RH.** Se um dia o grupo quiser que um setor em
piora dispare um aviso para outro sistema, basta acrescentar as variáveis
`WEBHOOK_*` no painel do Render, em **Environment**. Estão documentadas no
`.env.example`. Sem elas, nada é disparado — que é o comportamento certo para
a Mostra.
