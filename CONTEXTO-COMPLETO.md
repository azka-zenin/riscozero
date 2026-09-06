# RiscoZero — Contexto completo do projeto

> Este documento existe para dar contexto completo do zero — histórico,
> decisões, estado atual — a qualquer pessoa (ou conversa com IA) que precise
> entender o projeto inteiro sem ter acompanhado o processo. Cobre tudo: o
> que o sistema é, como foi construído, todas as rodadas de trabalho pelas
> quais passou, e onde as coisas estão agora.

**Estado em 06/09/2026** — 13 fases concluídas, todas no `main`. Sistema
publicado e funcionando em `riscozero.onrender.com`, com auto-deploy a partir
do `main`. 307 testes automatizados passando, `npm audit` sem
vulnerabilidades. Apresentação: Mostra Técnica 2026, terça-feira.

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

### Fase 10 — Auditoria final do projeto inteiro

Revisão completa de segurança, corretude e funcionamento, com cada suspeita
verificada empiricamente (requisições contra servidor real, navegador
automatizado) em vez de só por leitura de código. Quatro problemas reais,
todos corrigidos e cobertos por teste de regressão:

1. **`ocultos` em `GET /api/respostas/comentarios` era sistematicamente
   subcontado, podendo reportar zero.** A rota buscava um lote de 40 e
   classificava visível/oculto dentro de um laço que dava `break` ao juntar
   20 visíveis — os ocultos posteriores nunca eram contados, e além do lote
   nem eram buscados. Reproduzido: 30 comentários de setor grande + 2 de
   setor pequeno → API respondia `ocultos: 0`. A **supressão nunca falhou**
   (nenhum comentário de setor pequeno vazou); o que quebrava era o aviso ao
   painel — exatamente o "sumiço silencioso" que o comentário da própria
   rota declara inaceitável. Corrigido trocando a classificação em JS por
   duas consultas complementares (`$in` / `$nin` sobre os setores
   permitidos), o que também elimina o over-fetch.
2. **Trava de login contornável trocando o e-mail a cada tentativa.** A
   chave é `IP|email`, então cada e-mail novo estreia com contador zerado.
   Medido contra servidor real: **15/15 tentativas passaram**, nenhuma
   barrada. Permitia enumeração de contas e inundação do histórico de
   acessos a partir de um único IP. Corrigido com um segundo limitador por
   IP (40 / 15 min) empilhado sobre o existente — verificado depois: 40
   passam, o resto recebe 429. Junto: o `Map` de contadores nunca removia
   chave expirada (só reavaliava quem voltasse), então a mesma varredura o
   fazia crescer sem limite na memória do processo; agora há varredura de
   expirados uma vez por janela.
3. **Os três botões "Tentar de novo" (painel, contas, acessos) não
   funcionavam.** Usavam `onclick=""` inline, bloqueado pela própria CSP do
   sistema (`script-src 'self'` sem `'unsafe-inline'`). Confirmado em
   navegador: o handler não executa e o browser registra violação de CSP.
   Agravante: aparecem só na tela de erro, ou seja, falhavam justamente
   quando eram necessários. Trocados por `data-recarregar` + delegação de
   clique no container; as três telas verificadas derrubando a API e
   clicando no botão.
4. **Ajustes menores**: faltavam `Referrer-Policy` e HSTS (este condicional
   a HTTPS); `config.js` usava `Number(env) || padrao`, que descarta
   silenciosamente um `0` legítimo; e o e-mail gravado no histórico não
   tinha teto de tamanho — truncado em 254 (RFC 5321) **na origem**, não
   via validação do model, porque rejeitar faria a tentativa suspeita não
   ser registrada.

**Confirmado como correto** (vale tanto quanto os achados): injeção de
operadores de banco bloqueada no login e no formulário público (coerção via
`String()` e cast do Mongoose); XSS armazenado — testado enviando
`<img src=x onerror=alert(1)>` como e-mail numa tentativa de login e
abrindo o histórico num navegador real — neutralizado por `escaparHTML` e
pela CSP, sem `<img>` no DOM e sem execução; a correção de `req.ip` da Fase
8 verificada como semanticamente correta para `trust proxy: 1` (o Express
pega o segmento à direita, que o proxy anexa, não o forjável à esquerda); a
invariante "sempre existe ao menos um admin ativo" consistente entre `PUT`
e `DELETE`; `senhaHash` com `select: false` sem caminho de vazamento; e
`npm audit` com zero vulnerabilidades.

Resultado: **223 testes automatizados** (era 220) e 24 no Postman.

### Fase 11 — Identidade visual da tela de login + ícones de acesso em SVG

Sessão à parte, não documentada até agora neste arquivo (commit `58298ce`).
`.caixa-login` ganhou a mesma textura de marcação (régua) usada ao pé do
mostrador escuro do painel — a tela de login era a única superfície do
sistema sem nenhuma ligação visual com o resto do produto, apesar de ser a
segunda mais visitada (todo gestor, todo dia). Em `acessos.js`, os
caracteres Unicode ✓/✕ que marcavam entrada/falha (que mudam de peso e
proporção conforme a fonte do sistema operacional) viraram SVG com o mesmo
traço de 2px do ícone de alerta já usado em `dashboard.js`. Verificado com
navegação por teclado de ponta a ponta, sem regressão nos 223 testes + 24 do
Postman.

### Fase 12 — Segurança, roadmap e cobertura de teste

Usuário perguntou "o que dá pra refinar agora?" — mesmo padrão da Fase 8. Um
agente Explore fez uma varredura fresca (não repetindo o que já tinha sido
auditado) em cinco frentes: consistência visual entre telas, itens do
roadmap ainda não implementados, segurança/robustez, buracos de cobertura de
teste e polimento menor. O usuário pediu para implementar **todos** os
achados, sem exceção — inclusive os dois mais caros que a auditoria
recomendava deixar para depois da Mostra Técnica (e-mail e WebSockets).

Achados e o que foi feito, do mais barato ao mais caro:

1. **Cobertura de teste da ação pós-alerta.** A suíte nunca testava a rota
   com `tokenGestor` (só admin), nem o `400` de observação acima de 300
   caracteres, nem o rate limit do formulário. Adicionados 3 testes novos em
   `testes/testar-api.js`, seguindo o mesmo padrão dos testes de força bruta
   já existentes.
2. **Rate limiting em rotas de escrita autenticadas.** Fora login e
   formulário público, nenhuma rota passava por `criarLimitador` —
   `POST /setores/:setor/acao` (só exige login, não admin) aceitava
   tentativas sem limite. `middleware/limites.js` ganhou três limitadores
   novos, todos **por usuário** (não por IP, diferente dos dois já
   existentes) — a chave certa quando quem chama já está identificado por um
   login: `limiteAcaoAlerta` (20/15min), `limiteTrocarSenha` (10/15min) e
   `limiteEscritaUsuarios` (30/15min, no CRUD de contas). Verificado
   forçando o bloqueio nos testes, do mesmo jeito que o teste de força bruta
   do login já fazia.
3. **Nav não escondia "Usuários"/"Acessos" de gestores em
   `usuarios.html`/`acessos.html`.** `dashboard.js` já escondia esses links
   para quem não é admin (`GET /api/logs` exige admin); as outras duas
   páginas não replicavam a regra no próprio cabeçalho, então um gestor que
   chegasse por link direto via as duas opções como links normais.
   Replicado o mesmo bloco de `ajustarCabecalho` nas três páginas.
4. **Modo quiosque** (`index.html?quiosque=1`, roadmap). Já estava ~90%
   pronto — "Enviar outra resposta" já resetava o formulário. Faltava só
   auto-avançar de volta ao formulário alguns segundos depois da confirmação
   (`setTimeout` chamando o próprio botão) e esconder o link "Painel de
   gestão" nesse modo, pra ninguém tocar por engano num tablet fixo no chão
   de fábrica.
5. **Medir o efeito antes/depois de uma ação pós-alerta** (roadmap). Nova
   função `calcularEfeitoAcao` em `routes/respostas.js`: compara o índice
   médio do setor nos 7 dias antes de `AcaoAlerta.criadoEm` contra o
   índice desde então, com um mínimo de `MINIMO_RESPOSTAS_ALERTA` respostas
   dos dois lados (senão devolve `null` — não faz sentido mostrar uma média
   de 1 resposta como "resultado da ação"). Anexado a `ultimaAcao.efeito`
   no `/resumo`, mostrado no painel ao lado do texto "Ação registrada em
   {data}" (`montarEfeitoAcao` em `dashboard.js`), com cor só para a leitura
   de risco (melhorou = verde, piorou = laranja), a mesma disciplina de cor
   da Fase 5. `utils/analise.js` ganhou uma linha a mais no
   `module.exports` (expondo `VARIACAO_MINIMA`, que já existia) para não
   duplicar o limiar de "isso é uma mudança real, não ruído" — nada na
   fórmula de risco mudou.
6. **E-mail automático quando um setor ENTRA em risco alto** (roadmap, o
   item mais caro). Novo `utils/email.js`, via `nodemailer` — **opcional de
   propósito**: sem `SMTP_HOST` no `.env`, o aviso vira só uma linha no log,
   e o sistema continua funcionando normalmente, porque a apresentação não
   pode depender de internet estável só para isso. `precisaAvisar(setor,
   nivel)` guarda em memória o último nível notificado por setor e só
   retorna `true` na transição para "alto" (não a cada resposta nova
   enquanto permanece alto) — evita encher a caixa de entrada. Disparado em
   segundo plano (fire-and-forget, com `.catch`) depois de
   `POST /api/respostas` salvar, para não atrasar a confirmação de quem
   respondeu.
7. **Atualização instantânea via WebSockets** (roadmap). `server.js` passou
   a criar o `http.Server` explicitamente (`http.createServer(app)`) para o
   Socket.IO se anexar a ele — sem opções de CORS, já que front e API são a
   mesma origem. `POST /api/respostas` e `POST /setores/:setor/acao` emitem
   `painel:atualizado` depois de salvar; `dashboard.js` escuta e chama
   `carregarPainel(true)`. **O polling de 20s continua rodando do mesmo
   jeito** — decisão deliberada: se o socket cair (rede instável, a
   hospedagem gratuita reiniciando o processo), o painel não fica sem se
   atualizar. `testes/servidor-demo.js` ganhou a mesma ligação, para as
   telas de demonstração se comportarem como as de produção.

Verificado com a suíte completa (**238 testes automatizados**, 72 + 166 —
subiu de 223: 5 novos em `testar-analise.js` para `utils/email.js`, 10 novos
em `testar-api.js`) e 24 no Postman, sem regressão em nenhum dos dois.
Checagem visual com Playwright: nav escondida corretamente para gestor e
visível para admin, script do Socket.IO presente no painel, modo quiosque
escondendo o link do painel e voltando sozinho ao formulário após o tempo
configurado — sem nenhum erro de console além de abortos de requisição
esperados (navegação saindo de uma página com fetch em andamento).

---

### Fase 13 — Publicação, reconciliação do repositório e a caça ao bug da tela preta

Primeira fase com o sistema **já publicado e sendo usado de verdade** — e por
isso a primeira em que os problemas vieram do ambiente real (hospedagem
gratuita, cache de navegador, merge mal resolvido) em vez do código recém-
escrito. 14 commits, 35 arquivos, +1279/−366.

**1. Higiene de segredos.** O `.env.example` tinha sido apagado da árvore de
trabalho, e existia um `.env.txt` — cópia do `.env` real, com segredos de
produção — **fora do `.gitignore`**, a um `git add -A` de virar público num
repositório aberto. `.env.example` restaurado, `.env.txt` removido, `.env`
real preservado.

**2. Deploy do Render voltou a subir.** Estava falhando com `JWT_SECRET não
definido` — o Secret File tinha subido vazio. É o mesmo tipo de falha que a
checagem de força do segredo em `middleware/auth.js` existe para provocar
cedo (melhor não subir do que subir inseguro).

**3. Vulnerabilidade no `qs`.** Falha moderada (contorno do limite de array,
negação de serviço) herdada via `express → body-parser`. Corrigida com
`overrides` no `package.json`, sem trocar a versão do Express. `npm audit` →
0 vulnerabilidades.

**4. Reconciliação com o GitHub.** Comparadas todas as branches remotas com o
`main`: havia trabalho real nunca mergeado — a branch da Fase 12, que a
própria seção acima registrava como pendente de PR. Trazida para o `main`,
branches já integradas removidas. Também foi removida das docs a referência a
uma tag `v2.0-sqlite` que **nunca existiu** (nem local, nem remota — o
primeiro commit do repositório já é a v4.0 com MongoDB); no lugar, ponteiro
para o `MIGRACAO.md`, que é onde o contexto da migração de fato está.

**5. Regressões escondidas pelo merge — o padrão mais perigoso da fase.**
Quando duas branches divergidas se encontram, o conteúdo de um lado pode
substituir o do outro por inteiro, derrubando em silêncio features que só
existiam no lado perdedor. Não quebra teste, não gera conflito, e só aparece
quando alguém usa a tela. Três ocorrências, todas vindas do merge da Fase 12:

- **`server.js`** — quatro perdas de uma vez: o roteador `/api/bi` deixara de
  ser montado; o `express.static` tinha voltado à forma embutida, perdendo o
  `no-cache` do HTML; a rede de segurança contra queda do processo
  (`unhandledRejection` / `uncaughtException`) sumira; e o limite de 100kb no
  corpo das requisições voltara ao padrão sem teto.
- **`usuarios.html`** — faltava o markup do diálogo de confirmação, então
  `usuarios.js` chamava `addEventListener` em `null`, o script morria antes de
  desenhar a lista e a tela ficava **travada em "Carregando contas" para
  sempre**. Este era o sintoma que o usuário via como "carrega eternamente".
- **`usuarios.html` / `acessos.html`** — theme-color, preload de fonte,
  skip-link, `<noscript>`, `id="conteudo-principal"`, meta tags e o link
  "Chaves" na navegação, todos ausentes.

**6. Turnos Madrugada e Comercial.** Os 3 turnos originais (Manhã/Tarde/Noite)
assumiam operação de fábrica e deixavam de fora quem trabalha na madrugada
como escala separada e quem cumpre expediente comercial — o pessoal do setor
Administrativo era obrigado a escolher um turno de fábrica que não descrevia
sua rotina. Passaram a **cinco**. Deliberadamente **não** se criou um turno
"Administrativo": esse nome já existe como *setor*, e duplicá-lo confundiria
os dois conceitos. Mudança propagada por modelo, formulário, análise, seed,
servidor de demonstração, testes e coleção do Postman.

Um detalhe de língua que a mudança expôs: `utils/insights.js` montava a frase
como *"o turno da ${nome}"*, o que funciona para nomes de período (*"da
manhã"*) mas produz *"o turno da Comercial"* — errado, porque "Comercial" é
adjetivo, não período. A frase passou a ser *"o turno Comercial"*, forma que
serve aos cinco nomes por igual.

**7. O bug da tela preta.** Clicar em "Setores e turnos" no painel apagava
todo o conteúdo da página — **permanentemente**, sobrando só o cabeçalho. Foi
o problema mais caro da fase, e a causa não estava em nada que parecesse
relacionado.

`public/js/transicoes.js` intercepta cliques em links para fazer o fade entre
páginas, e seu teste de "link interno do site" aceitava qualquer `href` sem
`:` — o que inclui `#secao-setores`. A sequência:

1. Adiciona a classe `saindo` no `<html>`, que leva o `<main>` a `opacity: 0`.
2. Atribui o endereço a `window.location.href`.
3. Mas esse endereço difere do atual **só no fragmento**, e isso é navegação
   *no mesmo documento*: o navegador rola até a âncora e **não recarrega
   nada**.
4. Nenhum documento novo chega para levar a classe embora. O `<main>` fica
   invisível para sempre.

O cabeçalho continuava aparecendo porque está **fora** do `<main>` — o que
fazia o sintoma parecer "os dados não carregaram", quando na verdade tinham
carregado. Recarregar resolvia, o que reforçava a leitura errada.

O diagnóstico demorou porque duas pistas apontavam para o lugar errado: a
hospedagem gratuita de fato leva ~50s para acordar (então "demora e vem
preto" parecia timing), e o endereço tinha uma âncora (então parecia rolagem).
Houve várias tentativas de correção nessa direção — margem de rolagem,
`scroll-margin-top`, adiar a rolagem, resistir ao cold start. A medição que
encerrou a questão já existia desde cedo: `scrollY: 2042, secaoTop: 80.1`
provava que a rolagem estava **certa**, com a seção exatamente sob o
cabeçalho. Lida como *eliminação* da hipótese de rolagem em vez de mais um
sintoma dela, sobra "está no lugar e não se vê" — ou seja, opacidade — e um
único elemento cobre o `<main>` inteiro sem tocar no cabeçalho.

Correção na raiz: âncoras da própria página não são mais interceptadas (o
navegador rola sozinho, que é o comportamento correto). Mais duas redes de
segurança, porque a classe podia reaparecer por outros caminhos: ela é
removida no `pageshow` — o botão "voltar" restaura a página do cache de
histórico (bfcache) exatamente como estava, classe incluída — e expira por
tempo se a navegação não acontecer. De quebra, isso conserta o link "Pular
para o conteúdo" (`#conteudo-principal`), que tinha o mesmo defeito em
**todas** as telas: quem navega por teclado apagava a página no primeiro
atalho de acessibilidade do site.

A correção de rolagem por âncora do `dashboard.js` foi mantida (ela resolve um
caso real — abrir um endereço com `#secao-x` antes de o painel existir), mas
passou a desistir ao primeiro gesto de rolagem da pessoa. Antes insistia por
90 segundos, o que podia puxar a página de volta no meio de uma leitura.

**8. O que mascarava tudo: cache.** CSS e JS eram servidos com
`max-age=3600`. Como os nomes de arquivo não têm hash de conteúdo, o navegador
não volta a perguntar ao servidor por um `<script src>` que ainda considera
fresco — nem ao recarregar. O efeito prático foi que **correções já publicadas
e funcionando eram testadas contra o arquivo velho**, repetidamente, ao longo
de horas. CSS e JS passaram a `no-cache` (que não significa "não guarde", e
sim "guarde, mas confirme antes de usar" — uma requisição que responde 304).
Fonte e ícone, os arquivos pesados e os que de fato não mudam entre um push e
outro, seguem com a hora de cache. O comentário em `middleware/estaticos.js`
já antecipava esse risco para o HTML; a fase apenas levou o mesmo raciocínio
aos arquivos que mudam num push.

**9. Teste instável por fuso.** `testes/testar-bi.js` montava a data do filtro
com `toISOString()` (UTC) para uma rota que lê `?de=AAAA-MM-DD` como
meia-noite **local**. No Brasil (UTC−3) as duas divergem entre 21h e
meia-noite: nesse intervalo o teste pedia o dia seguinte e não achava a
resposta de "agora". Falhava só à noite — exatamente quando o time trabalha.
A rota está certa; o teste é que passou a montar a data no fuso local.

Verificado com a suíte completa (**307 testes**, 0 falhas), `npm audit` limpo,
e reprodução do bug da tela preta em servidor local antes e depois da
correção.

---

## 5. Estrutura de arquivos atual

```
riscozero/
├── server.js          Sobe o servidor e conecta as rotas
├── config.js          Fuso horário e limites de risco
├── database.js        Conexão com o MongoDB
├── seed.js/limpar.js  Dados de exemplo / limpeza (inclui AcaoAlerta)
├── preparar.js        Prepara o ambiente a partir do zero
├── render.yaml        Configuração de publicação (Render)
│
├── models/
│   ├── Resposta.js    Formato de uma resposta + setores/turnos válidos (5 turnos, Fase 13)
│   ├── Usuario.js     Contas de acesso + criptografia de senha
│   ├── LogAcesso.js   Registro de entradas e tentativas que falharam
│   ├── AcaoAlerta.js  Ação da gestão sobre um alerta (Fase 8)
│   └── TokenBI.js     Chaves de leitura para ferramentas de análise
│
├── utils/
│   ├── analise.js     ★ Cérebro: índice de risco, tendência, recomendações
│   ├── insights.js    Números → texto lido por humanos (regras, não IA)
│   ├── email.js       Aviso por e-mail em risco alto (opcional, Fase 12)
│   └── webhooks.js    Notificação para sistemas externos
│
├── middleware/
│   ├── auth.js        JWT (exigirLogin, exigirAdmin) + checagem de força do segredo
│   ├── limites.js     Rate limiting: login/formulário por IP, escrita autenticada por usuário (Fase 12)
│   ├── seguranca.js   Cabeçalhos de segurança (CSP, X-Frame-Options...)
│   └── estaticos.js   Entrega de public/ e política de cache (HTML/CSS/JS revalidam — Fase 13)
│
├── routes/
│   ├── respostas.js   API do formulário, painel, ação pós-alerta e efeito antes/depois
│   ├── usuarios.js    CRUD das contas de acesso
│   ├── logs.js        Consulta do histórico de acessos
│   ├── auth.js        Login, logout, troca de senha — origem via req.ip
│   └── bi.js          Exportação para ferramentas de análise + gestão de chaves
│
├── public/
│   ├── index.html     Formulário do trabalhador (suporta ?quiosque=1)
│   ├── login.html     Entrada do painel
│   ├── dashboard.html Painel de gestão (2 botões de exportação, Socket.IO)
│   ├── usuarios.html  Gerenciamento de contas (nav restrita por papel)
│   ├── acessos.html   Histórico de acessos (nav restrita por papel)
│   ├── chaves.html    Chaves de leitura para BI (só admin)
│   ├── 404.html       Página de erro própria
│   ├── manifest.json / favicon.svg / ícones    PWA (só o formulário)
│   ├── robots.txt
│   ├── css/style.css  Sistema de design único, compartilhado
│   ├── fonts/         Tipografia local, sem CDN
│   └── js/
│       ├── formulario.js, login.js, dashboard.js, usuarios.js,
│       │   acessos.js, chaves.js
│       ├── transicoes.js   Fade entre páginas — em TODAS as telas (ver Fase 13)
│       └── vendor/         Chart.js local
│
├── docs/POWER-BI.md   Como ligar o Power BI às rotas de exportação
├── postman/RiscoZero.postman_collection.json   24 requisições
│
└── testes/
    ├── testar-analise.js   Risco/tendência/insights/e-mail (81 testes)
    ├── testar-api.js       Rotas, login, permissões, CRUD, rate limit (166)
    ├── testar-webhooks.js  Entrega, falhas e novas tentativas (15)
    ├── testar-bi.js        Exportação, chaves, filtros de data (45)
    ├── verificar-banco.js  Testa o MongoDB real
    ├── servidor-demo.js    Sobe offline com banco em memória (com Socket.IO)
    ├── rodar-postman.js    Confere a coleção contra um servidor real
    └── mongo-falso.js      Banco em memória para os testes
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
| `PRE-APRESENTACAO-TERÇA.md` | Checklist do que conferir nos dias/horas antes da Mostra |
| `docs/POWER-BI.md` | Como ligar o Power BI (ou planilha/Looker) às rotas de exportação usando uma chave de leitura |
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
16. Rate limiting em rotas de escrita autenticadas é por usuário
    (`req.usuario._id`), não por IP — diferente de login/formulário, onde
    quem chama ainda não está identificado (Fase 12).
17. E-mail de alerta é opcional e nunca bloqueante: sem SMTP configurado, só
    fica no log; disparado fire-and-forget para não atrasar quem respondeu
    o formulário (Fase 12).
18. WebSockets complementa o polling, não o substitui — o painel precisa
    continuar se atualizando sozinho mesmo se o socket cair (Fase 12).
19. Turnos são cinco, e "Administrativo" **não** é um deles: esse nome já
    existe como *setor*, e repeti-lo como turno confundiria duas dimensões
    diferentes do mesmo dado (Fase 13).
20. Texto gerado nunca concorda com um nome vindo de dado: a frase é
    *"o turno Comercial"*, não *"o turno da Comercial"* — a forma sem artigo
    serve a todos os nomes, atuais e futuros (Fase 13).
21. Âncoras da própria página nunca passam pela transição entre telas: mudar
    só o fragmento não recarrega o documento, então qualquer estado ligado à
    saída da página ficaria preso (Fase 13).
22. HTML, CSS e JS revalidam a cada uso (`no-cache`); só fonte e ícone ficam
    em cache longo. Sem hash no nome do arquivo, cache longo em código
    significa publicar uma correção e continuar vendo o defeito (Fase 13).

---

## 8. Testes — estado atual

```bash
npm test           # 307 testes, sem precisar de banco (81 + 166 + 15 + 45)
npm run verificar  # testa o MongoDB de verdade (precisa do .env)
node testes/rodar-postman.js   # 24 requisições, contra um servidor real
```

- `testes/testar-analise.js` (81) — escalas invertidas, índice, tendência,
  geração de insights, casos de borda (série vazia, dia atípico), e a
  lógica de debounce do aviso por e-mail (`utils/email.js`).
- `testes/testar-api.js` (166) — rotas, login, permissões, CRUD,
  agregações, CSV (incluindo o teste de formula injection), histórico,
  ação pós-alerta (inclusive por gestor e o rate limit da rota), limite do
  formulário, e o efeito antes/depois de uma ação registrada.
- `testes/testar-webhooks.js` (15) — entrega, filtro de falhas, resumo e
  detecção de conta com muitas falhas seguidas.
- `testes/testar-bi.js` (45) — exportação completa/agregada/série, paginação,
  ciclo de vida das chaves (criação, revogação imediata, vencimento,
  permanência no histórico) e filtros de data.
- Todos rodam contra um MongoDB simulado em memória
  (`testes/mongo-falso.js`), sem precisar de banco instalado nem internet.

Datas em teste são montadas no **fuso local**, nunca com `toISOString()`: as
rotas leem `?de=AAAA-MM-DD` como meia-noite local, e em UTC−3 as duas
interpretações divergem entre 21h e meia-noite — um teste montado em UTC
passa o dia inteiro e falha só à noite (ver Fase 13).

---

## 9. Limitações conhecidas (assumidas abertamente)

- Sem invalidação de token antes do prazo (8h de validade).
- Depende de internet (banco na nuvem) — só o servidor de demonstração
  roda offline.
- Anonimato por design impede acompanhar um caso individual.
- Auditoria registra entradas, não navegação.
- Gerador de insights escolhe entre frases prontas, não compõe texto novo.
- O efeito antes/depois de uma ação usa uma janela fixa (7 dias antes,
  período inteiro depois) — não dá para escolher outro recorte pela
  interface.
- E-mail de alerta exige SMTP configurado no `.env`; sem isso, o aviso fica
  só no log do servidor (decisão deliberada — ver Fase 12).
- WebSockets depende do polling de 20s como reforço se a conexão cair; não
  há indicador visual de "socket conectado/desconectado" no painel.
- **A hospedagem gratuita "dorme" depois de 15 min sem acesso**, e a primeira
  visita depois disso pode levar ~50 segundos para responder (aviso do próprio
  Render). Não é defeito do sistema, mas é a limitação mais visível para quem
  abre o site — e, na apresentação, a razão para abrir o painel alguns minutos
  antes de começar. Foi também a pista que mais atrasou o diagnóstico da
  Fase 13, por dar aparência de "erro de carregamento" a um problema que era
  de CSS.
- Arquivos estáticos não têm hash no nome (`style.abc123.css`), então a
  garantia de ver a versão nova vem de revalidar a cada uso, não do endereço.
  Funciona, mas custa uma requisição condicional por arquivo.

---

## 10. Roadmap / ideias para adiante

- Medir o efeito de uma ação por mais de um recorte de tempo (hoje é uma
  janela fixa de 7 dias antes contra o período inteiro depois).
- Painel de configuração dos destinatários do e-mail de alerta, em vez de
  só por variável de ambiente.
- Indicador visual no painel de que o WebSocket está conectado (hoje é
  silencioso — só o polling de 20s é visível).

**Já implementado** (itens que já saíram do roadmap): comparação entre
turnos, painel com atualização automática, histórico de acessos, troca de
senha, recomendações por tendência, gerador automático de insights,
publicação online, exportar em PDF, registro de ação pós-alerta, e-mail
automático em risco alto, medir efeito antes/depois de uma ação, modo
quiosque, atualização instantânea via WebSockets (Fase 12), exportação para
ferramentas de análise com chaves de leitura revogáveis e webhooks para
sistemas externos.

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

- Repositório: `azka-zenin/riscozero`. Publicado em
  `riscozero.onrender.com` (Render + MongoDB Atlas), com **auto-deploy a
  partir do `main`** — todo push publica.
- **Todas as fases, de 1 a 13, estão no `main`.** A Fase 12, que ficou numa
  branch dedicada aguardando PR, foi integrada na Fase 13, junto com a
  limpeza das branches já mergeadas.
- Lição da Fase 13, que vale para qualquer merge futuro deste repositório:
  ao juntar branches divergidas, **conferir arquivo por arquivo o que existia
  só de um lado**. Um merge pode substituir um arquivo inteiro pelo conteúdo
  do outro lado sem gerar conflito, sem quebrar teste e sem qualquer sinal —
  e as features perdidas só aparecem quando alguém usa a tela.
- Presença ativa de testes automatizados como rede de segurança: qualquer
  mudança nova é verificada com `npm test` (307) + `node
  testes/rodar-postman.js` (24) antes de ser considerada concluída, além de
  verificação visual quando a mudança é de UI.
- Depois de publicar algo e ir testar no navegador, lembrar que **o que você
  está vendo pode ser a versão anterior**. Desde a Fase 13 o servidor manda
  CSS e JS revalidarem, o que resolve o caso normal; havendo dúvida, conferir
  com o cache desligado antes de concluir que a correção não funcionou.

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
- **Ao depurar, tratar uma medição que sai como esperado como eliminação de
  hipótese, não como sintoma a mais.** A Fase 13 custou horas porque
  `secaoTop: 80.1` — prova de que a rolagem estava correta — foi lida como
  mais um detalhe do problema de rolagem, em vez de como o fim daquela
  linha de investigação. Quando o elemento está no lugar certo e mesmo
  assim não se vê, o problema não é posição.
- Antes de concluir que uma correção publicada não funcionou, confirmar que
  o navegador está mesmo executando o arquivo novo.
