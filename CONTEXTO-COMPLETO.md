# RiscoZero — Contexto completo do projeto

> Este documento existe para dar contexto completo do zero — histórico,
> decisões, estado atual — a qualquer pessoa (ou conversa com IA) que precise
> entender o projeto inteiro sem ter acompanhado o processo. Cobre tudo: o
> que o sistema é, como foi construído, todas as rodadas de trabalho pelas
> quais passou, e onde as coisas estão agora.

---

## 1. O que é o RiscoZero

**Monitoramento de riscos psicossociais na Indústria 4.0.**
Projeto escolar — Mostra Técnica 2026, CEEP-PG, Equipe 1.
Tema da mostra: *Qualidade de Vida na Indústria 4.0 — o humano no centro da
tecnologia*.

**O problema**: a Indústria 4.0 reduziu o esforço físico do trabalhador, mas
aumentou a exigência mental — monitorar sistemas, decidir rápido, responder a
alarmes continuamente. A empresa mede produtividade, temperatura de máquina,
consumo de energia — tudo, menos como está a pessoa que opera tudo isso.
Quando o problema aparece, já virou afastamento, acidente ou queda de
produtividade.

**A solução**: o trabalhador responde um formulário curto e **anônimo**
(menos de um minuto) — setor, turno, e 4 perguntas numa escala de 1 a 5
(estresse, sono, carga de trabalho, ambiente físico). A gestão acessa um
painel que mostra, sem precisar interpretar nada: **onde** está o problema,
**há quanto tempo** vem piorando, e **o que fazer** a respeito.

---

## 2. Stack técnica

- **Backend**: Node.js + Express, MongoDB Atlas (via Mongoose), autenticação
  JWT, senhas com bcrypt, cabeçalhos de segurança (CSP, X-Frame-Options),
  limitação de tentativas de login.
- **Frontend**: HTML, CSS e JavaScript **vanilla** — sem framework, sem build
  step. Chart.js hospedado localmente (não vem de CDN). Fontes (Archivo,
  Public Sans, IBM Plex Mono) também locais.
- **Por que sem framework**: manter a stack simples o bastante para todo o
  time entender de ponta a ponta, sem dependência de rede pra apresentar.
- **Por que MongoDB (não SQL)**: decisão consciente — quem ficou responsável
  pela camada de dados já tinha experiência com Mongo. Cálculos de média e
  agrupamento seriam mais diretos em SQL (a equipe sabe do trade-off). A
  versão anterior do projeto usava **SQLite** (v2.0) — ver seção 4.

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

### O detalhe técnico central: escalas invertidas

As 4 perguntas usam a mesma escala de 1 a 5, mas **não apontam para o mesmo
lado**: nota 5 em estresse e carga é **ruim**; nota 5 em sono e ambiente é
**boa**. Para combinar num único índice, o sistema inverte sono e ambiente
com a fórmula `6 - nota` antes de somar. Só depois disso todas seguem a
mesma regra — **maior é sempre pior**. Essa lógica está isolada em
`utils/analise.js`.

### Classificação do risco

| Índice | Nível | Cor |
|---|---|---|
| até 2,2 | Baixo | verde |
| 2,3 a 3,4 | Médio | âmbar |
| acima de 3,4 | Alto | laranja |

As mesmas três cores se repetem em todo o sistema com o mesmo significado.

---

## 4. Linha do tempo completa

### Fase 0 — v2.0 SQLite → v3.0 MongoDB (migração, antes da sessão atual)

Versão original usava SQLite com senha única compartilhada
(`ceep2026` no `config.js`) e sessão em memória. Migrou para:

| | Antes (v2.0) | Depois (v3.0+) |
|---|---|---|
| Banco | SQLite (arquivo local) | MongoDB Atlas (nuvem) |
| Consultas | SQL (`SELECT`, `GROUP BY`) | Aggregation pipelines |
| Login | Uma senha para todos | Conta individual por pessoa |
| Senha | Texto puro no `config.js` | Hash bcrypt no banco |
| Sessão | Lista na memória do servidor | Token JWT assinado |
| Permissões | Não existiam | Admin e gestor |

Detalhes técnicos da migração (documentados em `MIGRACAO.md`):
- SQL `GROUP BY` virou pipeline `$match` → `$group` → `$sort`.
- **Armadilha de fuso horário**: MongoDB guarda tudo em UTC; sem declarar
  `timezone: 'America/Sao_Paulo'` nas agregações por dia, uma resposta às
  22h apareceria no dia seguinte no gráfico de evolução.
- Dois bugs reais encontrados pelos testes durante a migração: (1) conta de
  admin desativada ficava presa na trava de "não remover o último admin"
  porque não distinguia ativos de inativos; (2) gráficos não encolhiam ao
  redimensionar a janela (Chart.js precisa de um container com altura
  própria, senão mede errado).
- `utils/analise.js` quase não mudou na migração — recebe números já
  calculados, não sabe de onde vieram. Separar lógica de negócio do acesso
  ao banco poupou trabalho.

### Fase 1 — v4.0, esqueleto inicial e correções de fundação

Commit inicial (`60054aa`) trouxe o esqueleto funcional completo (v4.0).
Rodadas seguintes de correção e robustez:
- Reconstrução do `middleware/` que estava ausente do repositório.
- `seed.js` passou a gerar senha aleatória quando `ADMIN_SENHA` não está
  definida (em vez de senha fixa/previsível).
- `limpar.js` passou a exigir confirmação digitada antes de apagar dados.
- `database.js` ganhou retentativa na conexão inicial com o MongoDB.
- Mensagens de erro traduzidas para português (ex.: nota em formato
  inválido no formulário).

### Fase 2 — Acessibilidade e robustez de dados

- Mensagens e alertas anunciados a leitores de tela; gráficos com descrição
  textual (`aria-label`).
- Ícones de alerta em SVG, consistentes entre `dashboard.js` e `acessos.js`.
- Cobertura de teste para o branch de "piora sem indicador crítico ainda".
- Limite de linhas em `GET /api/respostas` (protege contra crescimento sem
  teto conforme o banco cresce).
- Limites de risco (os cortes 2,2 / 3,4) viraram configuráveis por variável
  de ambiente em `config.js`.
- `server.js`: encerramento gracioso em SIGTERM/SIGINT.
- `dashboard.js`: evita buscar dado sem mudança e preserva posição de
  rolagem entre atualizações automáticas.

### Fase 3 — Micro-interações (depois parcialmente revertidas — ver Fase 5)

Commit `e165cb5` adicionou: confirmação do formulário com um ícone de check
dentro de um círculo que se desenhava sozinho (SVG + `stroke-dashoffset`), e
um "pop" de escala (0%→108%→100%) ao selecionar qualquer opção de escala ou
filtro. **Essas duas coisas foram identificadas depois como o padrão visual
mais reconhecível de "IA genérica" e removidas na Fase 5.**

Também nesta fase: `dashboard.js` corrigido para os números pararem de
recomeçar do zero a cada atualização ao vivo (só anima na primeira
montagem).

### Fase 4 — Polimento de performance e infraestrutura

- `server.js`: compressão gzip e cache de arquivos estáticos
  (`express.static` com `maxAge`).
- Página 404 própria, no lugar da padrão do Express.
- `theme-color` e preload de fonte nas páginas internas.
- Manifest + ícone PWA — o formulário pode ser fixado na tela inicial do
  celular (só o formulário; o painel administrativo não precisa disso).
- Folha de estilo dedicada para impressão do painel (`@media print` —
  esconde cabeçalho/rodapé/controles, evita cortar cartões entre páginas,
  força cor de fundo a se manter no papel para os indicadores de risco).
- `robots.txt` bloqueando indexação (camada extra de cautela, já que o
  painel exige login de qualquer forma).

### Fase 5 — Diagnóstico e remoção do "cheirinho de IA" (rework de identidade visual)

O usuário perguntou se havia como tirar o "cheirinho de IA" aparente no
design. Um agente de exploração foi rodado especificamente para catalogar
sinais concretos. Achados, do mais forte pro mais fraco:

1. **Micro-interações da Fase 3** — o sinal mais forte, 100% introduzido
   numa sessão de "polish" anterior: checkmark que se desenha sozinho dentro
   de círculo verde claro + "pop" de escala 1.08 ao selecionar. É
   literalmente o clichê mais reconhecível de tela gerada por IA.
2. **Uniformidade sistemática demais** — mais sutil: toda exceção de
   design era explicada em comentário (um time humano teria inconsistência
   de hover não comentada).
3. **Densidade de comentário "POR QUE"** no CSS — real, mas invisível pra
   quem visita o site (só quem lê código vê).
4. **Padrão de texto nos insights automáticos** ("não é X, é Y",
   travessões) — moderado, baixa saliência visual.
5. **Estética geral** (face escura + cobalto + semáforo + régua) —
   "profissional e competente" mas sem personalidade específica de designer
   humano.

O usuário escolheu ser agressivo: **repensar a identidade visual como um
todo**, não só suavizar as duas micro-interações. Direção adotada: em vez de
trocar "genérico corporativo" por "genérico minimalista" (outro clichê), ou
trocar as três famílias tipográficas (caro/arriscado a poucos dias da
apresentação), a mudança foi **levar a ideia do instrumento de medição já
existente mais a sério e de forma mais consistente**:

1. **Cobalto deixou de ser "a cor de toda interação"** — hoje colore só
   ações primárias de verdade (botão principal, wordmark). Filtros, `.selo`
   de sistema/neutro e bordas ativas passaram a usar tinta neutra + peso
   tipográfico para indicar estado. Cor ficou reservada quase que
   exclusivamente para risco.
2. **`.selo` (badge/pill) deixou de ser o recurso padrão para tudo** — só
   continua como pílula preenchida para valores de risco de verdade
   (funcional ali). Para "sistema" (Admin/Gestor) e "neutro" (Desativada),
   virou etiqueta discreta: texto pequeno com traço fino embaixo, estilo
   marcação de instrumento — não mais pílula colorida.
3. **A confirmação do formulário trocou o ícone-em-círculo-que-se-desenha
   por uma régua se preenchendo** (`.regua`, elemento que já é a assinatura
   visual do sistema) — reaproveita algo que já existe e já tem
   significado, em vez de importar um ícone genérico de sucesso.
4. **O "pop" de escala ao selecionar saiu** — voltou a depender só de
   cor/peso, que já era suficiente.
5. **Textura fina de marcação** (tipo régua/papel milimetrado, via CSS
   `repeating-linear-gradient` — sem asset de imagem) adicionada como
   detalhe de assinatura derivado do próprio conceito, atrás do mostrador
   escuro do índice geral.

Execução em duas etapas: protótipo primeiro no `dashboard.html` (a tela mais
representativa), screenshot mandado direto pro usuário pra validar a direção
antes de espalhar pras outras 4 páginas (via `style.css` compartilhado).
Nada de lógica mudou; nenhuma classe referenciada por JS foi renomeada.

### Fase 6 — Ritmo e hierarquia (espaçamento, tipografia, gráficos)

O usuário sentiu que "espaçamentos, dimensão do site, tudo muito IA" ainda
persistia mesmo depois da Fase 5, e perguntou se trocar o modelo (Opus 5)
ajudaria — foi explicado que o problema é aplicação uniforme/mecânica de
tokens de espaçamento, não capacidade do modelo, e que não é possível trocar
o próprio modelo (é config do Claude Code). O usuário escolheu que uma
segunda passada crítica direta (não um subagente) resolvesse.

Auditoria em 3 frentes, na ordem pedida: **formulário/telas menores → tipografia/hierarquia → gráficos/cores**.

Achados de maior valor:
- `.campo { margin-bottom: var(--e-8); }` era um valor único para TODOS os
  campos de TODAS as páginas — Setor e Turno (contexto rápido) recebiam o
  mesmo respiro que separa qualquer coisa de qualquer coisa.
- `.botao` tinha o mesmo padding para "Enviar resposta" (ação mais
  importante do app, tocada no celular, uma vez por dia) e para botões
  administrativos.
- `.indice-grande` (o maior número do sistema) usava `font-weight: 600` —
  mais leve que o `h1` (700) e a logo (700). Achado mais claro e mais
  barato de corrigir de toda a auditoria.
- Gráfico "Risco por setor" (barra horizontal, 6 setores hoje) foi
  cogitado ganhar mais altura como o de evolução — mas descartado por estar
  pareado lado a lado com "Médias por indicador" num grid de 2 colunas;
  mudar só um dos dois quebraria o alinhamento visual da dupla.

Mudanças aplicadas:
1. `#form-risco > .campo:first-child { margin-bottom: var(--e-4); }` —
   tira respiro entre Setor e Turno especificamente.
2. `.botao.grande` — novo modificador com padding maior, aplicado só ao
   "Enviar resposta" do formulário público.
3. `.indice-grande { font-weight: 600 → 700 }`.
4. Chart height NÃO alterado (revertido depois de identificado o problema
   de pareamento — ver acima).

Verificado com `npm test` (213 à época) + Postman (23) sem regressão,
screenshots desktop/mobile antes/depois.

### Fase 7 — `PROJETO.md` criado

Usuário pediu um `.md` com "tudo que já foi feito, o projeto como um todo, o
que faz, como funciona" para apresentar profissionalmente a alguém de fora
do time. Criado `PROJETO.md` (documento próprio, complementar ao
`LEIA-ME.md` de setup e ao `APRESENTACAO.md` de roteiro de fala) cobrindo: o
problema, a solução, arquitetura, decisões de projeto, testes, e um resumo
do trabalho de UX/UI das Fases 5 e 6.

### Fase 8 — Segurança real, ação pós-alerta, exportar PDF, polimento

Usuário perguntou "o que mais dá pra fazer, o projeto já tá tão redondo?".
Um agente Explore levantou oportunidades concretas fora do design visual —
robustez, segurança, itens do roadmap. Achados priorizados, do mais
barato/valioso ao mais caro:

1. **CSV exportado vulnerável a "formula injection"** (OWASP): um
   comentário do formulário público começando com `=`, `+`, `-` ou `@`
   virava fórmula executável ao abrir o CSV no Excel. **Corrigido**:
   `escaparCSV` em `routes/respostas.js` agora prefixa esses casos com um
   apóstrofo, forçando o Excel a tratar como texto.
2. **IP de origem forjável** no limitador de tentativas de login e no
   histórico de acessos: o código lia `x-forwarded-for` manualmente e
   pegava o primeiro segmento (`split(',')[0]`) — exatamente o que um
   cliente malicioso pode forjar. **Corrigido**: trocado por `req.ip`, que
   o Express já calcula certo a partir do `trust proxy` configurado em
   `server.js` (`middleware/limites.js` e `routes/auth.js`).
3. **Acompanhamento de ação pós-alerta** (fecha item do roadmap): novo
   model `models/AcaoAlerta.js` (setor, quem, quando, observação opcional)
   e rota `POST /api/respostas/setores/:setor/acao`, protegida por login.
   O painel (`dashboard.js`, função `montarRecomendacoes`) ganhou um botão
   discreto "Marcar ação tomada" em cada cartão de setor em alerta —
   quando já existe uma ação, vira o texto "Ação registrada em {data} por
   {quem}", no mesmo estilo de etiqueta discreta da Fase 5 (sem introduzir
   um padrão visual novo). Escopo deliberadamente pequeno: só registra que
   alguém agiu, não mede automaticamente se o índice melhorou depois.
4. **Exportar em PDF** — botão novo ao lado do "Exportar CSV" existente,
   chamando `window.print()`. A folha de impressão da Fase 4 já cobria
   tudo que era preciso; só faltava expor a ação. Os dois botões de
   exportação foram agrupados num `<div class="grupo-exportar">` porque o
   layout de `.controles` (`justify-content: space-between`) foi pensado
   para dois filhos, não três — com três, os botões ficavam espalhados de
   forma estranha pela barra.
5. **Polimento menor**: estado vazio explícito no gráfico "Risco por
   turno" quando nenhuma resposta do período informou turno (antes só
   ficava um canvas em branco sem explicação); checagem de força mínima do
   `JWT_SECRET` no arranque do servidor (mínimo 32 caracteres — antes só
   se conferia que a variável existia).

Tudo verificado com suíte completa: **220 testes automatizados** (subiu de
213 — 6 testes novos cobrindo a ação pós-alerta + 1 cobrindo o CSV
injection fix) e **24 no Postman** (subiu de 23 — nova requisição "Marcar
ação pós-alerta" adicionada à coleção `postman/RiscoZero.postman_collection.json`
e ao runner `testes/rodar-postman.js`). Screenshots de desktop, mobile e
versão impressa via Playwright.

### Fase 9 — Roteiro de apresentação finalizado

`APRESENTACAO.md` atualizado para cobrir os dois passos novos no roteiro de
demonstração (marcar ação tomada, exportar PDF) e uma pergunta de FAQ sobre
a revisão de segurança recente. Durante essa revisão, identificado e
corrigido um gap real: `limpar.js` zerava respostas (e opcionalmente
usuários com `--tudo`) mas **não** zerava as ações pós-alerta — se alguém
testasse "Marcar ação tomada" durante o ensaio, isso ficaria gravado no
banco de verdade e apareceria na apresentação real. Corrigido: `limpar.js`
agora também apaga `AcaoAlerta`, e um item foi adicionado ao checklist do
roteiro alertando sobre isso.

---

## 5. Estrutura de arquivos atual

```
riscozero/
├── server.js               Sobe o servidor e conecta as rotas
├── config.js                Fuso horário e limites de risco
├── database.js               Conexão com o MongoDB
├── seed.js / limpar.js       Dados de exemplo / limpeza (agora inclui AcaoAlerta)
├── render.yaml                Configuração de publicação (Render)
│
├── models/
│   ├── Resposta.js            Formato de uma resposta + setores/turnos válidos
│   ├── Usuario.js             Contas de acesso + criptografia de senha
│   ├── LogAcesso.js           Registro de entradas e tentativas que falharam
│   └── AcaoAlerta.js          Registro de ação da gestão sobre um alerta (novo, Fase 8)
│
├── utils/
│   ├── analise.js             ★ Cérebro: índice de risco, tendência, recomendações
│   └── insights.js            Números → texto lido por humanos (regras, não IA)
│
├── middleware/
│   ├── auth.js                JWT (exigirLogin, exigirAdmin) + checagem de força do segredo
│   ├── limites.js              Rate limiting (login e formulário) — agora via req.ip
│   └── seguranca.js            Cabeçalhos de segurança (CSP, X-Frame-Options...)
│
├── routes/
│   ├── respostas.js            API do formulário, painel e ação pós-alerta
│   ├── usuarios.js             CRUD das contas de acesso
│   ├── logs.js                 Consulta do histórico de acessos
│   └── auth.js                 Login, logout, troca de senha — origem via req.ip
│
├── public/
│   ├── index.html               Formulário do trabalhador
│   ├── login.html                Entrada do painel
│   ├── dashboard.html             Painel de gestão (2 botões de exportação agora)
│   ├── usuarios.html               Gerenciamento de contas
│   ├── acessos.html                Histórico de acessos
│   ├── 404.html                     Página de erro própria
│   ├── manifest.json / ícones        PWA (só o formulário)
│   ├── robots.txt
│   ├── css/style.css                 Sistema de design único, compartilhado
│   ├── fonts/                         Tipografia local, sem CDN
│   └── js/
│       ├── formulario.js, login.js, dashboard.js, usuarios.js, acessos.js
│       └── vendor/                    Chart.js local
│
├── postman/RiscoZero.postman_collection.json   24 requisições
│
└── testes/
    ├── testar-analise.js        Lógica de risco/tendência/insights (67 testes)
    ├── testar-api.js             Rotas, login, permissões, CRUD (153 testes)
    ├── verificar-banco.js         Testa o MongoDB real
    ├── servidor-demo.js            Sobe offline com banco em memória
    ├── rodar-postman.js             Confere a coleção contra um servidor real
    └── mongo-falso.js                Banco em memória para os testes
```

---

## 6. Documentação disponível — o que cada arquivo cobre

| Arquivo | Para quê serve |
|---|---|
| `LEIA-ME.md` | Referência técnica principal: como instalar, rodar, comandos, decisões de projeto, estrutura, API, testes, limitações, roadmap |
| `PROJETO.md` | Documento de apresentação do projeto para quem é de fora do time — o problema, a solução, arquitetura, decisões, e um resumo das rodadas de UX/UI e segurança |
| `APRESENTACAO.md` | Roteiro minuto a minuto da apresentação oral, checklist, falas sugeridas, FAQ com respostas prontas, plano B se algo der errado |
| `MIGRACAO.md` | Documento de apoio explicando a migração SQLite → MongoDB (útil se a banca perguntar sobre a troca de banco) |
| `PUBLICAR.md` | Guia de publicação gratuita (Render + MongoDB Atlas), incluindo o alerta mais importante: o serviço grátis "dorme" depois de 15 min sem acesso |
| `CONTEXTO-COMPLETO.md` | Este arquivo — histórico e contexto completo do projeto |

---

## 7. Decisões de projeto consolidadas (o porquê, não só o quê)

1. Análise por setor, não só média geral (evita que um setor bom esconda um
   setor em crise).
2. Alertas exigem mínimo de 3 respostas (evita alarme falso).
3. Alertas médios em excesso são agrupados numa linha só.
4. Formulário anônimo por design.
5. Painel protegido, formulário aberto.
6. Senhas como hash bcrypt, nunca texto puro.
7. Login com JWT, sem sessão guardada no servidor (mas token não pode ser
   invalidado antes de expirar — por isso o prazo é curto, 8h).
8. Fuso horário explícito nas consultas por dia (evita erro de UTC).
9. Chart.js embutido no projeto, não vem de CDN.
10. Tendência pesa mais que valor absoluto (compara primeira metade do
    período com a segunda).
11. Gerador de insights usa regras explícitas, não IA (auditabilidade).
12. Nenhuma senha (nem a digitada errada) entra no histórico de acessos.
13. CSV escapa fórmulas maliciosas (Fase 8).
14. IP de origem vem de `req.ip`, não de cabeçalho lido manualmente (Fase 8).
15. Ações pós-alerta seguem o ciclo de vida das respostas (são apagadas
    junto, não junto com as contas) — Fase 9.

---

## 8. Testes — estado atual

```bash
npm test           # 220 testes, sem precisar de banco (67 + 153)
npm run verificar  # testa o MongoDB de verdade (precisa do .env)
node testes/rodar-postman.js   # 24 requisições, contra um servidor real
```

- `testes/testar-analise.js` (67) — escalas invertidas, índice, tendência,
  geração de insights, casos de borda (série vazia, dia atípico).
- `testes/testar-api.js` (153) — rotas, login, permissões, CRUD,
  agregações, CSV (incluindo o teste de formula injection), histórico,
  ação pós-alerta.
- Ambos rodam contra um MongoDB simulado em memória
  (`testes/mongo-falso.js`), sem precisar de banco instalado nem internet.

---

## 9. Limitações conhecidas (assumidas abertamente)

- Sem invalidação de token antes do prazo (8h de validade).
- Depende de internet (banco na nuvem) — só o servidor de demonstração
  roda offline.
- Anonimato por design impede acompanhar um caso individual.
- Auditoria registra entradas, não navegação.
- Atualização do painel a cada 20s, não instantânea (WebSockets ficaria
  para uma evolução futura).
- Gerador de insights escolhe entre frases prontas, não compõe texto novo.
- Ação pós-alerta registra que algo foi feito, mas não mede automaticamente
  se o índice melhorou depois (fica para uma evolução futura).

---

## 10. Roadmap / ideias para adiante

- Envio de e-mail automático quando um setor entra em risco alto.
- Medir automaticamente se o índice melhorou depois de uma ação registrada
  (comparação antes/depois).
- Modo quiosque: tablet fixo no chão de fábrica com o formulário sempre
  aberto.
- Atualização instantânea via WebSockets.

**Já implementado** (itens que já saíram do roadmap): comparação entre
turnos, painel com atualização automática, histórico de acessos, troca de
senha, recomendações por tendência, gerador automático de insights,
publicação online, exportar em PDF, registro de ação pós-alerta.

---

## 11. Como rodar

```bash
npm install
cp .env.example .env        # preencher MONGODB_URI, JWT_SECRET, ADMIN_EMAIL/SENHA
npm run verificar            # confirma a conexão com o banco
npm run seed                  # cria o administrador e dados de exemplo
npm start                      # http://localhost:3000
```

Sem banco configurado: `node testes/servidor-demo.js` sobe o sistema
inteiro offline, com dados de exemplo em memória — as telas são idênticas
às de produção. Login de demonstração:
`pedro@ceeppg.br` / `senha123` (admin) e `ana@ceeppg.br` / `senha456` (gestor).

---

## 12. Fluxo de trabalho / estado do repositório

- Repositório: `azka-zenin/riscozero`.
- Branch de trabalho desta sessão: `claude/github-cloud-sync-0yhl7o`.
- Autorização explícita do usuário (dada em sessões anteriores) para
  commitar e dar push **diretamente no `main`**, sem abrir Pull Request —
  fluxo usado em todas as fases: push na branch de trabalho, verificação de
  fast-forward, push no `main`.
- Todas as fases de 1 a 9 já estão commitadas e enviadas ao `main`. Não há
  trabalho pendente sem commit neste momento.
- Presença ativa de testes automatizados como rede de segurança: qualquer
  mudança nova é verificada com `npm test` (220) + `node
  testes/rodar-postman.js` (24) antes de ser considerada concluída, além de
  verificação visual (Playwright) quando a mudança é de UI.

---

## 13. Estilo de trabalho estabelecido nesta sessão (para quem for continuar)

- Mudanças de UI só avançam depois de screenshot enviado (`SendUserFile`)
  quando o usuário pede checkpoint visual, ou quando a mudança é ampla o
  bastante para merecer confirmação antes de espalhar pra outras telas.
- Nenhuma mudança toca `utils/analise.js` (cálculo de risco) ou
  `utils/insights.js` (geração de texto) sem necessidade explícita — são o
  "cérebro" do sistema e o que a apresentação mais precisa defender.
- Nenhuma classe CSS referenciada por JavaScript (`.selo.sistema`,
  `.selo.risco-*`, etc.) é renomeada — só o CSS por trás pode mudar de
  aparência.
- Todo trabalho aditivo/pontual é preferido a refatoração ampla, dado que a
  apresentação ("Mostra Técnica 2026") é iminente e o risco precisa ficar
  baixo.
- Comentários em código só quando explicam um "porquê" não óbvio — este é,
  inclusive, um dos sinais de "cheirinho de IA" que foi identificado e
  discutido (densidade alta de comentários "por quê" no CSS é real, mas
  tratada como problema secundário porque é invisível pra quem visita o
  site).
