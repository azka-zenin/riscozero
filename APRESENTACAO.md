# Roteiro de apresentação — RiscoZero

Equipe 1 · Mostra Técnica 2026 · CEEP-PG

---

## Checklist antes de começar

- [ ] `.env` preenchido no computador da apresentação
- [ ] `npm install` já rodado
- [ ] `npm run verificar` passou sem erros
- [ ] `npm run seed` rodado (painel cheio de dados)
- [ ] Servidor ligado com `npm start`
- [ ] Navegador com **três abas**: formulário, painel e contas
- [ ] Testado no computador que será usado de verdade, não só no de casa
- [ ] Alguém do grupo sabe reiniciar o servidor se travar
- [ ] Capturas de tela salvas como plano B
- [ ] Se alguém clicou em "Marcar ação tomada" durante o ensaio, rode
      `npm run limpar` de novo antes de apresentar — senão o painel real
      mostra "ação registrada" do ensaio, não da apresentação

> **Se o sistema estiver publicado:** abra o link **5 minutos antes** de
> apresentar. No plano gratuito o serviço dorme após 15 minutos sem acesso e
> demora até um minuto para acordar — bem na hora em que a banca está olhando.
> Ver `PUBLICAR.md`.
>
> **Plano B para falta de internet:** o banco fica na nuvem, então sem rede o
> sistema não sobe. Se isso acontecer, rode `node testes/servidor-demo.js` — ele
> usa um banco em memória, com dados de exemplo, e funciona offline. As telas
> são exatamente as mesmas.

---

## Roteiro (8 a 10 minutos)

### 1. Abertura — o problema (1 min)

> "A Indústria 4.0 trouxe robôs, sensores e inteligência artificial para o chão
> de fábrica. O esforço físico do trabalhador diminuiu — mas a exigência mental
> aumentou. Hoje ele monitora sistemas, toma decisões rápidas e responde a
> alarmes o tempo todo.
>
> O problema é que a empresa mede tudo: produtividade, temperatura das máquinas,
> consumo de energia. Só não mede como está a pessoa que opera tudo isso. E
> quando percebe, já virou afastamento, acidente ou demissão."

**Conecte com o tema:** o humano no centro da tecnologia.

---

### 2. A solução em uma frase (30s)

> "O RiscoZero usa a mesma tecnologia da Indústria 4.0 — coleta de dados,
> análise automática e painel em tempo real — mas apontada para dentro: para
> cuidar de quem trabalha, e não só do que é produzido."

---

### 3. Demonstração ao vivo (4 min)

**Passo 1 — O formulário** (aba 1)

Preencha respondendo com notas ruins (estresse 5, sono 1).

> "São 4 perguntas, menos de um minuto. O trabalhador não se identifica — só
> informa o setor. Isso é proposital: ninguém responde com sinceridade sobre
> estresse se souber que o nome dele vai aparecer para o chefe."

**Passo 2 — O painel** (aba 2)

Faça o login na frente da banca.

> "Cada gestor tem a própria conta. As senhas ficam criptografadas no banco —
> nem quem tem acesso ao banco consegue lê-las."

Aponte, nesta ordem:

1. **Os alertas no topo** — "o sistema já diz onde está o problema"
2. **O bloco de abertura** — o índice, a régua de 1 a 5 e, ao lado, o texto
   explicando o que aquilo significa:
   > "Repare que a primeira coisa da tela não é gráfico: é o número e a leitura
   > dele. Quem abre o painel entende a situação sem precisar interpretar
   > barra nenhuma."
3. **O gráfico de evolução** — "dá para ver o dia exato em que piorou"
4. **O risco por setor** — "Produção em vermelho, TI em verde"
5. **O risco por turno** — "o mesmo setor pode estar tranquilo de manhã e em
   crise à noite; separar por turno revela o que a média do dia esconde"
6. **As recomendações** — "e aqui ele diz o que fazer, não só que tem problema.
   Note que ele distingue 'risco alto e piorando', que pede ação hoje, de
   'risco alto mas melhorando', que pode esperar"

   Clique em **"Marcar ação tomada"** num dos cartões:
   > "E o ciclo não para na recomendação. Quando o gestor faz algo a respeito,
   > ele marca aqui — fica registrado quem agiu e quando. Fecha o loop entre
   > 'o sistema apontou o problema' e 'alguém cuidou disso'."

**Passo 3 — A atualização automática**

Mostre o indicador verde no cabeçalho ("atualizado agora").

> "O painel busca dados novos a cada 20 segundos, sozinho. E se a conexão cair,
> ele não apaga a tela: fica laranja e avisa de que horário são os dados que
> você está vendo. Dado velho identificado é mais útil que tela em branco."

Se der, peça para alguém da plateia preencher o formulário no celular e mostre
o número subindo sozinho no painel.

**Passo 4 — Filtro e exportação**

Clique em "7 dias" e mostre os gráficos mudando. Depois "Exportar CSV" e
"Exportar PDF".

> "O RH pode levar esses dados para uma reunião ou cruzar com registros de
> afastamento. O CSV serve para quem vai cruzar os números numa planilha; o
> PDF é o painel inteiro pronto para imprimir ou anexar num relatório."

**Passo 5 — Contas de acesso** (aba 3)

> "Aqui o administrador gerencia quem entra no painel — criar, editar, suspender
> ou remover. Um gestor comum vê os dados, mas não mexe em contas."

Mostre que sua própria conta não tem botão de remover.

> "O sistema impede que alguém se remova por engano, e protege o último
> administrador — senão ninguém mais conseguiria criar contas."

---

### 4. A parte técnica (2 min)

Mostre a estrutura de pastas e explique o caminho do dado:

> "O formulário manda os dados para uma API em Node.js com Express. A API valida
> tudo — se o setor existe, se as notas estão entre 1 e 5 — e grava no MongoDB.
> O painel consulta essa mesma API, que devolve os dados já analisados."

**Destaque as escalas invertidas** (é o ponto mais forte tecnicamente):

> "Teve um problema que a gente precisou resolver: as quatro perguntas usam a
> escala de 1 a 5, mas não apontam para o mesmo lado. Nota 5 em estresse é ruim.
> Nota 5 em qualidade do sono é boa. Se somasse tudo direto, o resultado não
> significaria nada.
>
> Então o sistema inverte as perguntas positivas com a fórmula 6 menos a nota.
> Nota 5 de sono vira 1 de risco. Depois disso todas seguem a mesma regra: maior
> é pior. Só assim o índice combinado faz sentido."

**Se quiser mostrar o Postman:**

> "Documentamos e testamos todas as rotas da API no Postman — dá para ver aqui
> cada requisição, o que ela espera e o que devolve."

---

### 5. Fechamento (1 min)

> "A Indústria 4.0 é ótima em transformar dado em decisão — para a máquina.
> O RiscoZero faz a mesma coisa para a pessoa.
>
> A tecnologia aqui não substitui ninguém: ela dá para o gestor a informação que
> ele não tinha como enxergar sozinho. O humano continua no centro — só que
> agora com dado para provar que ele precisa de atenção."

---

## Perguntas prováveis e como responder

**"Isso não é invasão de privacidade?"**
> Pelo contrário — o sistema é anônimo por design. Ele não sabe quem respondeu,
> só o setor. E os alertas só disparam com no mínimo 3 respostas, justamente
> para que ninguém seja identificado por eliminação.

**"E se a pessoa mentir na resposta?"**
> Pode acontecer, principalmente se ela não confiar no sistema. Por isso o
> anonimato não é um detalhe, é a base do projeto. E como olhamos a tendência ao
> longo do tempo, não uma resposta isolada, uma mentira pontual não distorce o
> resultado.

**"Onde entra a Indústria 4.0 nisso?"**
> Em três pontos: coleta contínua de dados, análise automática que gera alertas
> sem ninguém pedir, e decisão baseada em dado e não em achismo. É exatamente o
> que a Indústria 4.0 faz com as máquinas — aplicado às pessoas.

**"Por que MongoDB e não um banco SQL?"**
> Foi decisão de equipe. O integrante responsável pela camada de dados já tinha
> experiência com Mongo, e código que quem mantém entende de verdade vale mais
> do que a tecnologia melhor no papel escrita por alguém inseguro nela. Vale
> dizer que para cálculos de média e agrupamento o SQL até seria mais direto —
> a gente sabe do trade-off. A versão anterior usava SQLite e está preservada no
> histórico do Git.

**"Por que vocês não usaram inteligência artificial?"**
> Usamos regras explícitas de propósito. Numa decisão sobre saúde do
> trabalhador, o gestor precisa saber **por que** o sistema apontou aquele
> setor. Com regras claras dá para auditar e explicar. Uma IA acertaria
> parecido, mas ninguém saberia justificar a decisão — e num assunto desse, isso
> importa. É uma evolução possível, mas o critério teria que continuar visível.

**"Vocês usaram inteligência artificial nos textos do painel?"**
> Não, e isso foi escolha. Os textos são montados por regras explícitas que
> escolhem entre frases prontas conforme os números. Chamamos de gerador
> automático de insights. O motivo é o mesmo das recomendações: numa decisão
> sobre saúde do trabalhador, é preciso poder abrir o código e ver por que o
> sistema disse aquilo. Com IA o texto sairia mais variado, mas ninguém
> conseguiria auditar o critério.

**"Por que o painel é escuro?"**
> É decisão de identidade visual, não acidente: o sistema se pensa como um
> instrumento de medição — mostrador escuro, régua de 1 a 5, cor reservada
> quase só para indicar risco (verde, âmbar, vermelho). Testamos o contraste
> de todo texto no padrão de acessibilidade WCAG AA antes de fechar a
> paleta, então o painel continua legível em projetor e sob luz de ginásio.

**"O painel atualiza em tempo real?"**
> Sim — assim que alguém responde o formulário ou a gestão marca uma ação,
> um WebSocket avisa o painel na hora, sem precisar recarregar a página. E
> se essa conexão cair por qualquer motivo, ele continua se atualizando
> sozinho a cada 20 segundos como reforço, só redesenhando quando algo
> realmente mudou — senão a tela ficaria piscando a cada ciclo.

**"Como vocês garantem que funciona?"**
> Temos mais de 238 testes automatizados que rodam com um comando
> (`npm test`), sem precisar de banco instalado. Eles verificam as rotas, o
> login, as permissões, o CRUD, os cálculos e a geração dos textos —
> incluindo casos de borda, como um dia atípico que não deve virar
> tendência. Vários bugs reais foram encontrados por eles durante o
> desenvolvimento. Além disso, a coleção do Postman documenta a API inteira
> e tem um script que confere se cada requisição descrita ali ainda
> funciona de verdade — documentação que não bate com o sistema é pior que
> documentação nenhuma.

**"Vocês fizeram alguma revisão de segurança?"**
> Fizemos, e ela achou coisa de verdade. Quatro problemas, todos corrigidos
> e cobertos por teste:
>
> - O CSV exportado deixava passar "injeção de fórmula": um comentário
>   começando com `=` era interpretado como fórmula ao abrir no Excel — um
>   ataque conhecido e documentado.
> - A trava de tentativas de login contava por IP **e** e-mail juntos, então
>   quem trocasse o e-mail a cada tentativa nunca esbarrava no limite.
>   Medimos: 15 tentativas seguidas passaram sem nenhuma ser barrada.
>   Colocamos um segundo teto, só por IP, em cima do que já existia.
> - O aviso de "comentários ocultos" do painel podia dizer zero havendo
>   comentários ocultos. A proteção de anonimato em si nunca falhou —
>   nenhum comentário de setor pequeno chegou a aparecer —, mas o painel
>   deixava de avisar que existiam comentários suprimidos.
> - Os botões "Tentar de novo" das telas de erro não funcionavam: usavam um
>   recurso que a nossa própria política de segurança do navegador bloqueia.
>
> Se quiserem o detalhe técnico, está tudo escrito no `PROJETO.md`.

> **Dica:** esta é uma boa pergunta para *provocar*, se a banca não fizer.
> Achar bug no próprio projeto e corrigir com teste mostra mais maturidade
> do que dizer que estava tudo perfeito desde o começo.

**"As senhas estão seguras?"**
> São guardadas como hash bcrypt, não em texto puro. Um hash é uma conta que só
> funciona em um sentido: dá para verificar se a senha digitada bate, mas não
> dá para descobrir a original. Se o banco vazar, as senhas continuam
> protegidas.

**"Isso funciona numa empresa de verdade?"**
> A lógica sim. Para produção faltariam integração com o RH e registro de
> auditoria. Está tudo mapeado no LEIA-ME.

**"Quem fez o quê?"**
> Tenham essa resposta combinada antes. Cada um deve saber explicar sua parte
> **e** o fluxo geral.

**"O que foi mais difícil?"**
> Resposta honesta e boa: a lógica das escalas invertidas, e a descoberta de que
> analisar só a média geral escondia os setores em crise — um setor bom
> compensava um ruim e o alerta nunca disparava. Foi preciso refazer a análise
> setor a setor.

---

## Se algo der errado

| Problema | Solução |
|---|---|
| Servidor travou | `Ctrl + C` e `npm start` de novo |
| Não conecta no banco | Confira internet e o IP liberado no Atlas |
| Painel sem dados | Rode `npm run seed` |
| Erro "porta em uso" | Já tem um servidor rodando — feche o outro terminal |
| Sem internet | `node testes/servidor-demo.js` (funciona offline) |
| Link publicado lento | Normal se ficou parado: espere até 1 min e recarregue |
| Gráficos não aparecem | Atualize a página (F5); não dependem de internet |

**Nunca aperte Ctrl+C** depois que aparecer "RiscoZero no ar" — isso derruba o
servidor. Se precisar digitar outro comando, abra um terminal novo.
