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

## 3. Conferir se funcionou

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

## 4. O detalhe mais importante para a apresentação

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

## 5. Atualizar depois de mudar o código

O Render acompanha o repositório. Todo `git push` para o branch principal
dispara uma nova publicação automaticamente — não precisa fazer nada no painel
deles.

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
