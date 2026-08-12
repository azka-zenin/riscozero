# RiscoZero — Documento de projeto

**Monitoramento de riscos psicossociais na Indústria 4.0**
Mostra Técnica 2026 · CEEP-PG · Equipe 1
Tema: *Qualidade de Vida na Indústria 4.0 — o humano no centro da tecnologia*

---

## 1. O problema

A Indústria 4.0 reduziu o esforço físico do trabalhador, mas aumentou a
exigência mental: monitorar sistemas, tomar decisões rápidas, responder a
alarmes continuamente. A empresa mede produtividade, temperatura de máquina,
consumo de energia — tudo, exceto como está a pessoa que opera tudo isso.
Quando o problema aparece, já virou afastamento, acidente ou queda de
produtividade.

## 2. A solução

O RiscoZero aplica a mesma lógica da Indústria 4.0 — coleta contínua de
dados, análise automática, painel em tempo quase real — apontada para dentro:
para cuidar de quem trabalha, não só do que é produzido.

- O trabalhador responde um formulário curto e **anônimo** (menos de um
  minuto): setor, turno, e quatro perguntas numa escala de 1 a 5 (estresse,
  sono, carga de trabalho, ambiente físico).
- A gestão acessa um painel que mostra, sem precisar interpretar nada: **onde**
  está o problema, **há quanto tempo** vem piorando, e **o que fazer** a
  respeito.

---

## 3. Como funciona, de ponta a ponta

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

1. O trabalhador escolhe setor e turno e responde as 4 perguntas, com
   comentário opcional. **Não há identificação individual** — só setor e
   turno.
2. O servidor valida cada resposta (setor existe? nota é inteiro entre 1 e
   5?) e grava no MongoDB.
3. O painel consulta a mesma API, que devolve os dados já agregados: índice
   de risco por setor e por turno, tendência ao longo do tempo, alertas e
   recomendações prontas.

### O detalhe técnico central: escalas invertidas

As 4 perguntas usam a mesma escala de 1 a 5, mas **não apontam para o mesmo
lado**:

| Pergunta | Nota 5 significa | Direção |
|---|---|---|
| Estresse | Muito estressado | nota alta = **ruim** |
| Carga de trabalho | Sobrecarregado | nota alta = **ruim** |
| Qualidade do sono | Dormiu muito bem | nota alta = **bom** |
| Conforto do ambiente | Muito confortável | nota alta = **bom** |

Para combinar as quatro num único índice, o sistema inverte sono e ambiente
com a fórmula `6 - nota` antes de somar. Uma nota 5 de sono (ótimo) vira 1 de
risco; uma nota 1 (péssimo) vira 5. Só depois disso todas seguem a mesma
regra — **maior é sempre pior** — e o índice combinado passa a significar
algo. Essa lógica está isolada em `utils/analise.js`, o "cérebro" do sistema.

### Classificação do risco

| Índice | Nível | Cor |
|---|---|---|
| até 2,2 | Baixo | verde |
| 2,3 a 3,4 | Médio | âmbar |
| acima de 3,4 | Alto | laranja |

As mesmas três cores se repetem em todo o sistema com o mesmo significado —
cartões, gráficos, alertas, comentários — para que a leitura seja imediata,
sem legenda.

---

## 4. O que o painel entrega

- **Índice geral de risco**, em destaque, com leitura textual automática do
  período (não só o número — a frase que explica o que ele significa).
- **Risco por setor** e **risco por turno**, lado a lado com o risco geral —
  porque uma média única esconde crises localizadas (um setor em crise pode
  ser "compensado" por outro tranquilo na média geral).
- **Evolução do índice ao longo do tempo**, para identificar o dia exato em
  que um setor começou a piorar.
- **Alertas automáticos**, com um mínimo de respostas por setor exigido antes
  de disparar (evita alarme falso por uma única resposta ruim) e agrupamento
  de alertas médios quando são muitos (evita que "todo mundo em alerta"
  vire ruído e ninguém preste atenção).
- **Recomendações geradas por regras**, priorizadas por tendência: um setor em
  risco alto e piorando pede ação hoje; o mesmo risco em queda pode esperar.
- **Comentários da equipe**, exibidos como texto puro (proteção contra XSS).
- **Atualização automática a cada 20 segundos**, sem recarregar a página, com
  indicador de conexão — se a rede cair, o painel não apaga os dados: fica
  laranja e informa de que horário são os números na tela.
- **Exportação em CSV**, para levar os dados a uma reunião de RH.
- **Gestão de contas de acesso** (criar, editar, suspender, remover), restrita
  a administradores, com proteções contra remover a própria conta ou o
  último administrador do sistema.
- **Histórico de acessos**, incluindo tentativas de login malsucedidas, sem
  jamais guardar a senha digitada — nem a errada.

---

## 5. Decisões de projeto (o porquê, não só o quê)

Escolhas que mostram raciocínio sobre o problema, não apenas implementação:

1. **Análise por setor, não só média geral** — evita que um setor bom
   "esconda" um setor em crise.
2. **Alertas exigem um mínimo de respostas** (3) — evita alarme falso.
3. **Alertas médios em excesso são agrupados numa linha só** — evita que
   alerta em todo lugar signifique alerta em lugar nenhum.
4. **Formulário anônimo por design** — sinceridade sobre estresse exige que
   o nome não vá junto.
5. **Painel protegido, formulário aberto** — dado sensível de saúde mental
   fica restrito; a coleta precisa ser irrestrita para funcionar.
6. **Senhas como hash bcrypt**, nunca em texto puro — um vazamento do banco
   não expõe senha nenhuma.
7. **Login com JWT**, sem sessão guardada no servidor — reiniciar o servidor
   não desconecta ninguém, e o token não pode ser adulterado sem invalidar a
   assinatura.
8. **Fuso horário explícito nas consultas por dia** — sem isso, uma resposta
   às 22h apareceria no dia seguinte no gráfico de evolução (o Mongo guarda
   em UTC).
9. **Chart.js embutido no projeto, não vem de CDN** — os gráficos continuam
   funcionando mesmo sem internet no dia da apresentação.
10. **Tendência pesa mais que valor absoluto** — compara a média da primeira
    metade do período com a segunda, para que um único dia atípico não
    distorça a leitura.
11. **O gerador de insights usa regras explícitas, não IA** — numa decisão
    sobre saúde do trabalhador, o gestor precisa poder auditar *por que* o
    sistema apontou aquele setor. Regra clara é explicável; um modelo
    generativo não seria.
12. **Nenhuma senha (nem a digitada errada) entra no histórico de acessos** —
    parecia útil para investigação, mas viraria uma coleção de senhas reais
    em texto puro.

---

## 6. Arquitetura e stack

**Backend:** Node.js + Express, MongoDB Atlas (via Mongoose), autenticação
JWT, senhas com bcrypt, cabeçalhos de segurança (CSP, X-Frame-Options),
limitação de tentativas de login (proteção contra força bruta).

**Frontend:** HTML, CSS e JavaScript vanilla — sem framework. Chart.js
hospedado localmente. Fontes (Archivo, Public Sans, IBM Plex Mono) também
locais, sem dependência de CDN em nenhum ponto.

**Por que sem framework de front-end:** manter a stack simples o bastante
para todo o time entender de ponta a ponta, e sem dependência de build step
para depurar ou apresentar.

**Por que MongoDB e não SQL:** decisão consciente da equipe — quem ficou
responsável pela camada de dados já tinha experiência com Mongo, e código que
quem mantém entende de verdade vale mais que a tecnologia "melhor no papel"
escrita por alguém inseguro nela. Cálculos de média e agrupamento seriam mais
diretos em SQL — a equipe sabe do trade-off. A versão anterior do projeto
usava SQLite e está preservada no histórico do Git (`v2.0-sqlite`).

```
riscozero/
├── server.js              Sobe o servidor e conecta as rotas
├── config.js               Fuso horário e limites de risco
├── database.js             Conexão com o MongoDB
├── seed.js / limpar.js     Dados de exemplo / limpeza
│
├── models/                 Resposta, Usuario, LogAcesso
├── utils/
│   ├── analise.js          ★ Cérebro: índice de risco, tendência, recomendações
│   └── insights.js         Números → texto lido por humanos
├── middleware/              Autenticação, limites de taxa, cabeçalhos de segurança
├── routes/                  API: respostas, usuários, logs, auth
│
├── public/                  Formulário, login, painel, contas, acessos
│   ├── css/style.css        Sistema de design único, compartilhado por todas as telas
│   └── js/                  Um script por página + Chart.js local
│
├── postman/                 Coleção de testes manuais da API
└── testes/                  Suíte automatizada + servidor de demonstração offline
```

---

## 7. Qualidade e testes

- **223 testes automatizados** (`npm test`), rodando contra um MongoDB
  simulado em memória — funcionam em qualquer máquina, sem banco instalado e
  sem internet. Cobrem a lógica de risco e tendência (inclusive casos de
  borda, como série vazia ou um dia atípico que não deve virar tendência), as
  rotas da API, login, permissões, CRUD de contas e agregações.
- **24 testes de API via Postman** (`node testes/rodar-postman.js`),
  validando a coleção publicada em `postman/RiscoZero.postman_collection.json`
  contra um servidor real.
- **Servidor de demonstração offline** (`testes/servidor-demo.js`) — sobe o
  sistema inteiro com um banco em memória, para apresentar mesmo sem rede.
- **Verificação de contraste WCAG AA** em todo texto do sistema.
- **Acessibilidade**: mensagens e alertas anunciados a leitores de tela,
  gráficos com descrição textual, respeito a `prefers-reduced-motion`.

---

## 8. Refinamento de UX/UI (trabalho recente)

Depois da versão funcional inicial, houve uma rodada dedicada de polimento de
experiência, dividida em duas frentes.

### 8.1 — Identidade visual: de "genérico de dashboard" a "instrumento de medição"

Um diagnóstico de design identificou que, apesar de o sistema ser
tecnicamente sólido, a execução visual convergia para clichês reconhecíveis
de interface genérica de IA/SaaS: cor de marca usada para toda interação,
badges coloridos para qualquer rótulo, ícone de confirmação em
círculo-com-check que se desenha sozinho, micro-interação de "pop" de escala
a cada seleção. O mais forte desses sinais — o check-em-círculo animado e o
"pop" tátil — tinha sido introduzido numa rodada de polish anterior e foi
identificado e revertido nesta.

A correção não foi remover a personalidade, foi **levar mais a sério o
conceito que já existia** (o sistema como instrumento de medição — mostrador
escuro, régua de 1 a 5, disciplina semafórica de cor) em vez de recair em
vocabulário emprestado de qualquer outro produto:

- **Cor de marca (cobalto) restrita a ações primárias de verdade** — botão
  principal, wordmark — em vez de colorir todo controle secundário. Estado
  ativo em filtros e navegação passou a usar tinta neutra + peso tipográfico.
- **Badges (`.selo`) deixaram de ser o recurso padrão para tudo.** Continuam
  como pílula preenchida só onde é funcional (nível de risco); para papéis
  administrativos, viraram etiqueta discreta — texto com traço fino embaixo,
  no estilo de marcação de instrumento.
- **A tela de confirmação do formulário trocou o ícone genérico de sucesso
  por uma régua se preenchendo** — reaproveitando um elemento que já é a
  assinatura visual do sistema, em vez de importar um ícone de fora.
- **Textura de marcação (tipo régua/papel milimetrado)** adicionada como
  detalhe de assinatura derivado do próprio conceito, em pontos-chave do
  painel.

### 8.2 — Ritmo e hierarquia

Uma segunda auditoria, focada em espaçamento, tipografia e gráficos,
encontrou o mesmo padrão em escala menor: um sistema de espaçamento sólido,
mas aplicado de forma uniforme demais — o mesmo respiro entre quaisquer dois
elementos, independente da relação de conteúdo entre eles.

- **Formulário:** Setor e Turno (contexto rápido) ganharam menos respiro
  entre si; o botão "Enviar resposta" — a ação mais tocada do sistema, no
  celular, uma vez por dia — ganhou um alvo de toque maior, só ele.
- **Painel:** o índice geral de risco (o maior número do sistema) passou de
  peso 600 para 700 — não fazia sentido o dado mais importante da tela pesar
  menos que o título da página.
- **Gráficos:** avaliada e descartada a ideia de aumentar a altura do
  gráfico "Risco por setor", por ele estar pareado lado a lado com "Médias
  por indicador" — mudar só um dos dois quebraria o alinhamento visual da
  dupla de colunas.

Todo o trabalho desta seção foi validado sem alterar lógica de negócio, sem
renomear nenhuma classe referenciada por JavaScript, com a suíte completa de
213 + 23 testes passando e verificação visual em desktop e mobile antes de
cada mudança ser integrada.

### 8.3 — Segurança, fechamento do ciclo de alerta e exportação em PDF

Uma rodada seguinte, motivada por uma pergunta simples ("o que mais dá pra
fazer?"), levantou oportunidades concretas fora do design visual — robustez,
segurança e itens do roadmap ainda em aberto.

- **Dois bugs de segurança reais, corrigidos.** O CSV exportado era
  vulnerável a "formula injection": um comentário do formulário público
  começando com `=`, `+`, `-` ou `@` virava fórmula executável ao abrir no
  Excel — um vetor documentado pela OWASP. E o endereço de origem usado no
  limitador de tentativas de login e no histórico de acessos era lido
  manualmente do cabeçalho `x-forwarded-for`, que é forjável pelo próprio
  cliente; passou a usar `req.ip`, que o Express já calcula corretamente a
  partir da configuração de proxy confiável do servidor.
- **Acompanhamento de ação pós-alerta**, fechando um item do roadmap: cada
  alerta de setor no painel agora pode ser marcado como "ação tomada", com
  registro de quem e quando — um novo model (`AcaoAlerta`) e uma rota
  dedicada, sem tocar em nenhuma resposta individual nem no cálculo de
  risco em si. É deliberadamente o primeiro elo da corrente (alerta → ação
  registrada), não uma medição automática de "melhorou depois".
- **Exportar em PDF**, quase de graça: a folha de estilo de impressão já
  existia; faltava só um botão que chama a impressão do navegador.
- **Polimento menor**: estado vazio explícito para o gráfico de risco por
  turno quando nenhuma resposta do período informou turno, e uma checagem
  de força mínima do `JWT_SECRET` no arranque do servidor (antes só se
  conferia que a variável existia, não que era forte o suficiente).

Mesmo padrão de disciplina das rodadas anteriores: tudo aditivo, nenhuma
mudança na lógica de cálculo de risco, suíte completa (220 testes + 24 do
Postman) e verificação visual antes de integrar.

---

## 9. Auditoria final

Antes de fechar o projeto, o código passou por uma revisão completa —
segurança, corretude e funcionamento — em que cada suspeita foi verificada
na prática (requisições contra um servidor de verdade, navegador
automatizado), não só na leitura. Quatro problemas reais apareceram, todos
corrigidos e cobertos por teste:

1. **A contagem de comentários ocultos podia anunciar zero havendo
   comentários ocultos.** A rota buscava um lote e decidia dentro de um laço
   que interrompia ao juntar 20 comentários visíveis — os ocultos que
   viessem depois nunca eram contados. Medido: com 30 comentários de um
   setor grande e 2 de um pequeno, a API respondia "ocultos: 0". A supressão
   em si nunca falhou (nenhum comentário de setor pequeno vazou em momento
   algum); o que falhava era o aviso de que existiam comentários suprimidos
   — justamente o sumiço silencioso que a rota se propõe a evitar. Agora a
   separação é feita por consulta ao banco, e a soma sempre fecha.
2. **A trava de tentativas de login podia ser contornada trocando o
   e-mail.** Como a chave é IP + e-mail, cada e-mail novo estreava com o
   contador zerado. Medido: 15 tentativas seguidas do mesmo endereço, com
   e-mails diferentes, passaram todas. Entrou um segundo teto por IP (40 em
   15 minutos) em cima do que já existia, sem desfazer o motivo original.
   Junto, o contador em memória nunca descartava chave velha — a mesma
   varredura o fazia crescer sem limite.
3. **Os três botões "Tentar de novo" não funcionavam.** Usavam `onclick`
   escrito no HTML, que a própria política de conteúdo do sistema bloqueia.
   Confirmado em navegador. O detalhe ruim é onde isso aparecia: só na tela
   de erro, ou seja, o botão falhava exatamente quando era necessário.
4. **Ajustes menores**: cabeçalhos `Referrer-Policy` e HSTS que faltavam;
   configuração que descartava silenciosamente um valor `0` legítimo; e
   limite de tamanho no e-mail gravado no histórico de acessos.

Igualmente relevante, o que a auditoria **confirmou estar correto**:
injeção de operadores de banco (NoSQL injection) bloqueada tanto no login
quanto no formulário público; XSS armazenado — testado enviando um payload
real por uma tentativa de login e abrindo o histórico num navegador —
neutralizado por escape e pela política de conteúdo; a correção de origem
de IP da rodada anterior verificada como semanticamente correta; a trava do
último administrador ativo consistente entre edição e remoção; e nenhuma
vulnerabilidade conhecida nas dependências.

---

## 10. Limitações conhecidas

Simplificações conscientes, assumidas abertamente:

- **Sem invalidação de token antes do prazo** — como o servidor não guarda
  sessão, sair apaga o token localmente, mas um token copiado valeria até
  expirar (8 horas).
- **Depende de internet** — o banco está na nuvem; sem rede, o sistema para
  (só o servidor de demonstração roda offline).
- **Anonimato por design** — bom para respostas sinceras, mas impossibilita
  acompanhar um caso individual.
- **Auditoria registra entradas, não navegação** — sabe-se quem entrou e
  quando, não quais telas a pessoa abriu depois.
- **Atualização a cada 20 segundos, não instantânea** — tempo real de
  verdade exigiria WebSockets (mapeado como evolução futura).
- **Gerador de insights escolhe entre frases prontas** — cobre bem os casos
  do sistema, mas não compõe texto além do que foi previsto.

---

## 11. Evolução futura mapeada

- Envio de e-mail automático quando um setor entra em risco alto
- Medir automaticamente se o índice melhorou depois de uma ação registrada
  (o registro em si já existe — falta a comparação antes/depois)
- Modo quiosque para tablet fixo no chão de fábrica
- Atualização instantânea via WebSockets

---

## 12. Como executar

```bash
npm install
cp .env.example .env      # preencher MONGODB_URI, JWT_SECRET, ADMIN_EMAIL/SENHA
npm run verificar          # confirma a conexão com o banco
npm run seed                # cria o administrador e dados de exemplo
npm start                   # http://localhost:3000
```

Sem banco configurado, `node testes/servidor-demo.js` sobe o sistema
inteiro offline, com dados de exemplo em memória — as telas são idênticas às
de produção.

Detalhes completos de instalação, comandos e resolução de problemas em
`LEIA-ME.md`; roteiro de apresentação em `APRESENTACAO.md`.
