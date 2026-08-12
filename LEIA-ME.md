# RiscoZero

**Monitoramento de riscos psicossociais na Indústria 4.0**

Mostra Técnica 2026 — CEEP-PG — Equipe 1
Tema: *Qualidade de Vida na Indústria 4.0: o humano no centro da tecnologia*

---

## O que é

A Indústria 4.0 reduz o esforço físico do trabalhador, mas aumenta a exigência
mental e os riscos psicossociais. O RiscoZero mede exatamente isso: o
trabalhador responde um formulário curto e anônimo sobre como está se sentindo,
e a gestão vê um painel que aponta **onde** está o problema e **o que fazer** a
respeito — antes que vire afastamento, acidente ou queda de produtividade.

É a resposta prática à pergunta do tema: se a fábrica automatizou, quem cuida de
quem opera a automação?

---

## Como rodar

**Precisa ter:** Node.js 18 ou mais novo, e uma conta gratuita no MongoDB Atlas.

### 1. Preparar o banco (só na primeira vez)

1. Crie uma conta em [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Crie um cluster gratuito (opção **M0 Free**)
3. Em **Database Access**, crie um usuário do banco e anote a senha
   (é diferente da senha de login do site)
4. Em **Network Access**, libere o acesso
5. Em **Database → Connect → Drivers**, copie a *connection string*

### 2. Configurar o projeto

```bash
cp .env.example .env
```

Abra o `.env` e preencha:

- `MONGODB_URI` — a connection string copiada acima (troque `<senha>` pela senha real)
- `JWT_SECRET` — gere com:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `ADMIN_EMAIL` e `ADMIN_SENHA` — a primeira conta de acesso ao painel

> O `.env` **nunca** vai para o GitHub — ele já está no `.gitignore`. Nunca cole
> a connection string em grupo de mensagem: ela é a chave do banco de vocês.

### 3. Instalar e iniciar

```bash
npm install       # instala as dependências
npm run verificar # confere se o banco está configurado certo
npm run seed      # cria o administrador e dados de exemplo
npm start         # liga o servidor
```

Abra no navegador: **http://localhost:3000**

| Página | Endereço | Acesso |
|---|---|---|
| Formulário | `/` | Aberto a todos |
| Painel | `/dashboard.html` | Exige login |
| Contas de acesso | `/usuarios.html` | Exige login |
| Histórico de acessos | `/acessos.html` | Apenas administradores |

### Comandos disponíveis

| Comando | O que faz |
|---|---|
| `npm start` | Liga o servidor |
| `npm run seed` | Cria o admin e ~200 respostas fictícias dos últimos 30 dias |
| `npm run limpar` | Apaga as respostas (mantém as contas) |
| `npm run limpar -- --tudo` | Apaga respostas **e** contas |
| `npm run verificar` | Testa a conexão com o MongoDB e as consultas do painel |
| `npm test` | Roda os testes automatizados (não precisa de banco) |
| `node testes/servidor-demo.js` | Sobe o sistema sem MongoDB, para demonstrar offline |

> **Antes de apresentar:** rode `npm run seed` para o painel abrir cheio de
> dados. Se quiser coletar respostas ao vivo da plateia, rode `npm run limpar`
> antes para começar do zero.

---

## Como funciona

```
  TRABALHADOR                SERVIDOR                      GESTÃO
  ───────────                ────────                      ──────

  Formulário                 API valida e grava            Painel
  4 perguntas   ──POST──►    (Express + Mongoose)  ──GET──► gráficos
  escala 1-5                        │                       alertas
  anônimo                           ▼                       recomendações
                             MongoDB Atlas                       ▲
                                    │                            │
                                    ▼                        exige login
                             Módulo de análise                  (JWT)
                             calcula risco e
                             gera recomendações
```

1. O trabalhador escolhe setor e turno e responde 4 perguntas numa escala de
   1 a 5 (estresse, sono, carga de trabalho, ambiente físico), com comentário
   opcional. **Não há identificação individual** — só setor e turno.
2. O servidor valida (setor existe? nota entre 1 e 5? é inteiro?) e grava.
3. O painel busca os dados já agregados, com índice de risco, alertas e ações
   sugeridas.

---

## O detalhe mais importante: as escalas invertidas

Esta é **a** pergunta que a banca provavelmente vai fazer.

As 4 perguntas usam a mesma escala de 1 a 5, mas **não apontam para o mesmo lado**:

| Pergunta | Nota 5 significa | Direção |
|---|---|---|
| Estresse | Muito estressado | Nota alta = **ruim** |
| Carga de trabalho | Sobrecarregado | Nota alta = **ruim** |
| Qualidade do sono | Dormiu muito bem | Nota alta = **bom** |
| Conforto do ambiente | Muito confortável | Nota alta = **bom** |

Para combinar as quatro num único índice, o sistema **inverte** sono e ambiente
com a fórmula `6 - nota`. Uma nota 5 de sono (ótimo) vira 1 de risco; uma nota 1
(péssimo) vira 5. Depois disso, tudo segue a mesma regra: **maior = pior**.

Sem essa inversão, o índice somaria coisas contraditórias e o número não
significaria nada.

Toda essa lógica está em `utils/analise.js`, comentada linha a linha.

### Classificação do risco

| Índice | Nível | Cor |
|---|---|---|
| até 2,2 | Baixo | verde |
| 2,3 a 3,4 | Médio | âmbar |
| acima de 3,4 | Alto | laranja |

As mesmas três cores aparecem em todo o sistema com o mesmo significado —
cartões, gráficos, alertas e comentários. Isso torna a leitura imediata, sem
precisar de legenda.

---

## Decisões de projeto

Estas escolhas mostram que o grupo pensou no problema, não só escreveu código.

**1. A análise é feita por setor, não só na média geral.**
Se a Produção está em crise mas o TI está ótimo, a média dos dois fica
"aceitável" e nenhum alerta dispararia — justamente quando a empresa mais
precisaria agir. Analisando setor a setor, o problema aparece onde ele está.

**2. Alertas exigem um mínimo de respostas.**
Um setor só gera alerta com pelo menos 3 respostas. Sem isso, uma única pessoa
num dia ruim dispararia alarme falso e o painel perderia credibilidade.

**3. Muitos alertas médios viram uma linha só.**
Quando todo setor tem seu próprio alerta, alerta nenhum chama atenção.

**4. O formulário é anônimo por design.**
O sistema não sabe quem respondeu, só o setor. Ninguém responde com sinceridade
sobre estresse sabendo que o nome vai junto.

**5. O painel é protegido, o formulário não.**
Resposta sobre saúde mental é dado sensível. O formulário precisa ser aberto
(todos respondem), mas a visualização é restrita.

**6. Senhas são guardadas como hash, nunca em texto puro.**
Um hash é o resultado de uma conta que só funciona em um sentido: dá para
verificar se a senha digitada bate, mas não dá para descobrir a original. Se o
banco vazar, as senhas continuam protegidas.

**7. Login com JWT em vez de sessão na memória.**
O token carrega quem é o usuário e vai assinado pelo servidor. Se alguém tentar
editar o conteúdo — por exemplo, trocar o papel para "admin" — a assinatura
deixa de bater. Como nada fica guardado no servidor, reiniciar não desconecta
ninguém.

**8. O fuso horário é declarado nas consultas por dia.**
O MongoDB guarda datas em UTC. Sem informar `America/Sao_Paulo`, uma resposta
enviada às 22h apareceria no dia seguinte no gráfico de evolução.

**9. Chart.js está dentro do projeto, não vem da internet.**
Se o computador da apresentação estiver sem rede, os gráficos continuam
funcionando. Depender de CDN seria arriscar a apresentação.

**10. Comentários são exibidos como texto puro.**
Se alguém digitar `<script>` no formulário, aparece como texto e não executa —
proteção contra XSS, um ataque em que código digitado por um usuário roda no
navegador de outro.

**11. O painel se atualiza sozinho, mas só redesenha quando algo muda.**
A cada 20 segundos ele busca dados novos. Reconstruir a tela em todo ciclo
faria os gráficos piscarem e cancelaria a animação para, na maior parte das
vezes, mostrar exatamente os mesmos números.

**12. Queda de conexão mantém os dados antigos na tela.**
Em vez de apagar tudo e mostrar um erro, o indicador fica laranja e informa de
que horário são os dados. Dado velho identificado é mais útil que tela em
branco no meio de uma apresentação.

**13. A tendência pesa mais que o valor absoluto.**
Um setor em risco alto e piorando pede ação hoje; o mesmo risco em queda pode
esperar. A comparação usa a média da primeira metade do período contra a
segunda — assim um único dia atípico não define a leitura.

**14. Alertas de risco médio são agrupados quando são muitos.**
Se todo setor tem seu próprio alerta, alerta nenhum chama atenção.

**15. Nenhuma senha entra no histórico de acessos, nem as digitadas errado.**
Guardar a tentativa parece útil para investigar, mas viraria uma coleção de
senhas em texto puro — incluindo senhas reais digitadas na conta errada por
engano.

**16. O gerador de insights usa regras, não inteligência artificial.**
Os textos do painel são montados por regras explícitas escolhendo entre frases
prontas. Foi decisão consciente, pelo mesmo motivo das recomendações: em
decisão sobre saúde do trabalhador, o critério precisa poder ser auditado. Ao
apresentar, chame de **gerador automático de insights** — chamar de IA seria
impreciso, e um avaliador técnico perceberia.

---

## Por que MongoDB (e não SQL)

Escolha consciente da equipe, com um motivo prático: **o integrante responsável
pela camada de dados já tinha experiência com MongoDB**. Código que quem mantém
entende de verdade vale mais do que a tecnologia "melhor no papel" escrita por
alguém inseguro nela.

Vale conhecer os dois lados, caso perguntem:

- **A favor do Mongo aqui:** os documentos guardam a resposta inteira em um só
  lugar, sem precisar de tabelas relacionadas; e é o que a equipe domina.
- **A favor do SQL:** cálculos de média e agrupamento (que é o coração deste
  painel) são mais diretos de escrever em SQL do que em aggregation pipelines.

A versão anterior do projeto usava SQLite e está preservada no histórico do Git,
na tag `v2.0-sqlite`.

---

## Estrutura dos arquivos

```
riscozero/
├── server.js              Liga tudo: sobe o servidor e conecta as rotas
├── config.js              Fuso horário e limites de risco
├── database.js            Conexão com o MongoDB (Mongoose)
├── .env                   Senhas e endereço do banco (NÃO vai para o GitHub)
├── .env.example           Modelo do .env, sem segredos
├── seed.js                Cria o admin e gera dados de exemplo
├── limpar.js              Apaga os dados
│
├── render.yaml            Configuração de publicação (ver PUBLICAR.md)
│
├── models/
│   ├── Resposta.js        Formato de uma resposta + setores e turnos válidos
│   ├── Usuario.js         Contas de acesso + criptografia de senha
│   └── LogAcesso.js       Registro de entradas e tentativas que falharam
│
├── utils/
│   ├── analise.js         ★ Cérebro: risco, tendência e recomendações
│   └── insights.js        Transforma os números em texto lido por humanos
│
├── middleware/
│   ├── auth.js            Verifica o token JWT e o papel do usuário
│   ├── limites.js         Freio contra força bruta no login e envio em massa
│   └── seguranca.js       Cabeçalhos de segurança (CSP, X-Frame-Options...)
│
├── routes/
│   ├── respostas.js       API do formulário e do painel
│   ├── usuarios.js        CRUD das contas de acesso
│   ├── logs.js            Consulta do histórico de acessos
│   └── auth.js            Login, logout e troca de senha
│
├── public/                Tudo que o navegador carrega
│   ├── index.html         Formulário do trabalhador
│   ├── login.html         Entrada do painel
│   ├── dashboard.html     Painel de gestão
│   ├── usuarios.html      Gerenciamento de contas
│   ├── acessos.html       Histórico de acessos
│   ├── css/style.css
│   ├── fonts/             Tipografia (cópia local, não vem de CDN)
│   └── js/
│       ├── formulario.js
│       ├── login.js       Login + utilitários de sessão
│       ├── dashboard.js   Gráficos, alertas, régua e leitura automática
│       ├── usuarios.js    CRUD pela interface
│       ├── acessos.js     Histórico de acessos
│       └── vendor/        Chart.js (cópia local)
│
├── postman/
│   └── RiscoZero.postman_collection.json   Coleção pronta para importar
│
└── testes/
    ├── testar-analise.js   Testes da lógica de risco, tendência e insights
    ├── testar-api.js       Testes das rotas (npm test)
    ├── verificar-banco.js  Verifica o MongoDB real (npm run verificar)
    ├── servidor-demo.js    Sobe o sistema sem MongoDB, para demonstração
    ├── rodar-postman.js    Confere se a coleção do Postman ainda funciona
    └── mongo-falso.js      Banco em memória usado pelos testes
```

---

## A API

| Método | Rota | Acesso | O que faz |
|---|---|---|---|
| GET | `/api/saude` | Público | Diz se o sistema e o banco estão de pé |
| POST | `/api/auth/login` | Público | Entra e recebe o token |
| POST | `/api/auth/trocar-senha` | Logado | Troca a própria senha |
| POST | `/api/auth/logout` | Logado | Encerra a sessão |
| GET | `/api/auth/eu` | Logado | Quem está logado |
| POST | `/api/respostas` | **Público** | Grava uma resposta |
| GET | `/api/respostas` | Logado | Lista as respostas |
| GET | `/api/respostas/resumo` | Logado | Médias, índice, alertas, recomendações |
| GET | `/api/respostas/evolucao` | Logado | Índice de risco dia a dia |
| GET | `/api/respostas/turnos` | Logado | Risco por turno de trabalho |
| GET | `/api/respostas/comentarios` | Logado | Comentários deixados |
| GET | `/api/respostas/exportar` | Logado | Baixa tudo em CSV |
| POST | `/api/usuarios` | **Admin** | Cria conta |
| GET | `/api/usuarios` | Logado | Lista contas |
| GET | `/api/usuarios/:id` | Logado | Detalha uma conta |
| PUT | `/api/usuarios/:id` | **Admin** | Atualiza conta |
| DELETE | `/api/usuarios/:id` | **Admin** | Remove conta |
| GET | `/api/logs` | **Admin** | Histórico de acessos |
| GET | `/api/logs/resumo` | **Admin** | Números e sinais de alerta do histórico |

As rotas de dados aceitam `?periodo=7`, `?periodo=30` ou `?periodo=tudo`.

**Testando no Postman:** importe `postman/RiscoZero.postman_collection.json`,
rode a requisição **Login** e as demais já funcionam — o token é guardado
automaticamente.

---

## Testes

```bash
npm test           # 213 testes, sem precisar de banco
npm run verificar  # testa o MongoDB de verdade (precisa do .env)
```

O `npm test` roda dois conjuntos:

| Arquivo | O que cobre |
|---|---|
| `testes/testar-analise.js` | Escalas invertidas, índice, tendência e geração de insights — inclusive casos de borda como série vazia e dia atípico |
| `testes/testar-api.js` | Rotas, login, permissões, CRUD, agregações, CSV e histórico |

Ambos usam um MongoDB simulado em memória (`testes/mongo-falso.js`), então
rodam em qualquer computador, sem internet e sem banco instalado.

O `npm run verificar` faz o oposto: usa o banco de verdade, para confirmar que o
Atlas está configurado certo. Rode sempre que trocar de computador.

---

## Limitações (sejam honestos se perguntarem)

O projeto é escolar e tem simplificações conscientes:

- **Não dá para invalidar um token antes de ele expirar.** Como o servidor não
  guarda sessões, sair apaga o token do navegador — mas se alguém tivesse
  copiado o token, ele valeria até vencer. Por isso o prazo é curto: 8 horas.
- **O sistema depende de internet**, já que o banco está na nuvem. Se a rede
  cair, o sistema para. (O Chart.js, esse sim, é local.)
- **Dados anônimos por design** — bom para respostas sinceras, mas significa que
  não dá para acompanhar um caso individual.
- **Os dados de exemplo são fictícios**, gerados por sorteio. Não representam
  pessoas ou empresas reais.
- **A auditoria registra entradas, não visualizações**: sabemos quem entrou e
  quando, mas não que telas a pessoa abriu depois.
- **O painel atualiza a cada 20 segundos, não instantaneamente.** Se alguém
  responder o formulário enquanto o painel está aberto, aparece no próximo
  ciclo. Atualização de verdade em tempo real exigiria outra tecnologia
  (WebSockets), que fica mapeada como evolução possível.
- **O gerador de insights escolhe entre frases prontas.** Cobre bem os casos
  do sistema, mas não escreve nada além do que foi previsto.

Assumir essas limitações é melhor do que ser pego afirmando que o sistema é mais
robusto do que é.

---

## Se algo der errado

| Problema | Solução |
|---|---|
| `MONGODB_URI não definida` | Copie `.env.example` para `.env` e preencha |
| Não conecta no banco | Confira a senha na URI e libere o IP em Network Access no Atlas |
| `EADDRINUSE` | Já tem um servidor rodando — feche o outro terminal |
| Painel vazio | Rode `npm run seed` |
| Não consigo entrar | Rode `npm run seed` para criar o administrador |
| Sem internet no dia | Use `node testes/servidor-demo.js` (roda sem banco, para demonstração) |

---

## Divisão de tarefas (Equipe 1)

| Área | Arquivos | Pessoas |
|---|---|---|
| Banco de dados e API | `database.js`, `models/`, `routes/` | 1–2 |
| Lógica de análise | `utils/analise.js` | 1 |
| Formulário | `index.html`, `formulario.js` | 1 |
| Painel e gráficos | `dashboard.html`, `dashboard.js` | 1–2 |
| Pesquisa e apresentação | Slides, justificativa, dados sobre o tema | 1–2 |

**Importante:** todo mundo deve entender o fluxo básico
(formulário → API → banco → painel) e a lógica das escalas invertidas. Numa
banca, a pergunta pode cair para qualquer integrante.

---

## Já implementado desde a versão anterior

- [x] Comparação entre turnos (manhã, tarde, noite)
- [x] Painel que se atualiza sozinho, com indicador de conexão
- [x] Histórico de acessos e troca de senha
- [x] Recomendações que consideram a tendência, não só o momento
- [x] Gerador automático de insights em texto
- [x] Publicação online (ver `PUBLICAR.md`)

## Ideias para adiante

- [ ] Envio de e-mail automático quando um setor entra em risco alto
- [ ] Exportar relatório em PDF, além do CSV
- [ ] Registro de ações: anotar o que a gestão fez após cada alerta e verificar
      se o índice melhorou depois — fecharia o ciclo do sistema
- [ ] Modo quiosque: um tablet no chão de fábrica com o formulário sempre aberto
- [ ] Atualização instantânea via WebSockets, em vez do ciclo de 20 segundos
