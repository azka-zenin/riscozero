// dashboard.js
// Monta todo o painel de gestão: alertas, cartões, gráficos, recomendações
// e comentários. Depende de login.js, que fornece o objeto Sessao.

const conteudo = document.getElementById('conteudo');
const subtituloPeriodo = document.getElementById('subtitulo-periodo');
const botoesPeriodo = document.querySelectorAll('.filtro-periodo button');
const botaoExportar = document.getElementById('botao-exportar');
const botaoExportarPDF = document.getElementById('botao-exportar-pdf');
const botaoSair = document.getElementById('botao-sair');

let periodoAtual = '30';

// ---------------------------------------------------------------------------
// Atualização automática
//
// O painel busca dados novos sozinho, sem a pessoa precisar apertar F5. O
// intervalo de 20 segundos é um meio-termo: rápido o bastante para a tela não
// ficar desatualizada durante uma apresentação, e espaçado o bastante para não
// gerar chamadas ao banco à toa.
// ---------------------------------------------------------------------------

const INTERVALO_ATUALIZACAO = 20000; // 20 segundos
let temporizador = null;

// Assinatura dos últimos dados carregados, usada para não redesenhar o painel
// quando nada mudou (ver carregarPainel).
let assinaturaAtual = null;

// Momento da última atualização bem-sucedida, exibido no indicador
let ultimaAtualizacao = null;

// As animações de entrada rodam só na primeira montagem do painel. Repeti-las
// a cada atualização de 20 segundos faria os números recomeçarem do zero para
// mudar de 197 para 198 — distração pura, e ruim numa apresentação.
let primeiraMontagem = true;

// Se a página abre com um endereço de âncora (#secao-setores etc.), o
// navegador tenta rolar até lá SOZINHO, cedo demais — antes de os dados
// chegarem e o painel existir de verdade. Ele erra feio (medido: acaba no
// rodapé da página) e, o pior, não tenta de novo depois: rolagem nativa por
// âncora só acontece uma vez, na carga.
//
// Em vez de tentar corrigir depois de errado, tiramos o hash da URL ANTES de
// o navegador chegar a agir — history.scrollRestoration('manual') também
// evita que ele restaure uma posição de rolagem antiga num F5. Guardamos o
// hash à parte e fazemos a rolagem nós mesmos, na hora certa (depois que o
// painel montar de verdade), devolvendo o endereço à URL nesse momento.
const hashInicial = location.hash;
if (hashInicial) {
  history.replaceState(null, '', location.pathname + location.search);
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// A carga inicial pode chamar montarPainel mais de uma vez, e nem sempre
// depressa: no plano gratuito, uma instância "dormindo" pode levar 50s ou
// mais para acordar (aviso do próprio Render). Nesse tempo, o temporizador de
// atualização automática de 20s (iniciarAtualizacaoAutomatica, chamado sem
// esperar a primeira carregarPainel terminar) já dispara sozinho uma ou duas
// vezes, então mais de uma resposta pode chegar fora de ordem, minutos
// depois da primeira. Cada montagem troca o conteúdo (logo, o elemento-alvo)
// inteiro, então uma correção que desiste depois da primeira tentativa bem-
// sucedida corre o risco de um retardatário substituir o elemento certo por
// um novo, sem que nada role até ele depois. Por isso corrigirHashPendente
// só desarma de vez depois de esgotado o prazo abaixo — até lá, toda
// montagem cancela a tentativa anterior e agenda outra.
const PRAZO_CORRIGIR_HASH_MS = 90000; // folga sobre o "50s ou mais" do Render
const corrigirHashAte = Date.now() + PRAZO_CORRIGIR_HASH_MS;
let corrigirHashPendente = !!hashInicial;
let temporizadorCorrigirHash = null;

// ...mas o prazo acima só vale enquanto quem manda na rolagem for o endereço,
// e não a pessoa. No instante em que ela rola por conta própria, ir atrás da
// âncora deixa de ser "levar aonde pediu" e vira arrancar a página da mão de
// quem está lendo — inaceitável no meio de uma apresentação. O primeiro
// gesto de rolagem cancela a correção de vez.
if (corrigirHashPendente) {
  const desistirDaCorrecao = () => {
    corrigirHashPendente = false;
    clearTimeout(temporizadorCorrigirHash);
  };
  // wheel/touchmove/keydown são o gesto humano; o "scroll" solto não serve
  // aqui porque o nosso próprio scrollIntoView também o dispararia.
  ['wheel', 'touchmove', 'keydown'].forEach((evento) => {
    window.addEventListener(evento, desistirDaCorrecao, { once: true, passive: true });
  });
}

// Parece o mesmo que primeiraMontagem, mas responde a outra pergunta.
//
// primeiraMontagem é "os NÚMEROS devem se animar?" — e a troca de período a
// reativa de propósito, para deixar claro que os valores mudaram (ver o
// tratador dos botões de período).
//
// Esta aqui é "o painel está CHEGANDO na tela?", e só é verdade uma vez por
// carregamento da página. É ela que decide se a cascata de entrada do CSS —
// os blocos surgindo um depois do outro, mais de um segundo até o último —
// deve acontecer. Trocar o filtro não é chegar: o painel já está na tela.
//
// Enquanto as duas viviam na mesma variável, trocar o período apagava o
// painel inteiro e o trazia de volta em cascata, com quase um segundo e meio
// de tela vazia no meio.
let cascataJaAconteceu = false;

// Último valor mostrado de cada número animado (chave em data-chave), para a
// contagem partir dali na atualização seguinte em vez de sempre recomeçar do
// zero — ver animarNumero e animarEntrada logo abaixo.
const ultimosValoresAnimados = {};

// Guarda as instâncias do Chart.js para poder destruí-las antes de redesenhar.
// Sem isso, trocar o filtro de período empilha gráficos sobre o mesmo <canvas>
// e o Chart.js lança erro de "canvas já em uso".
const graficos = {};

// Espelha o esqueleto que já vem pronto em dashboard.html, para reaparecer
// ao trocar de período sem manter duas versões do mesmo markup divergindo.
const ESQUELETO_PAINEL = `
  <div class="esqueleto-painel" aria-hidden="true">
    <div class="esq-bloco esq-alertas"></div>
    <div class="esq-bloco esq-destaque"></div>
    <div class="esq-cartoes">
      <div class="esq-bloco"></div>
      <div class="esq-bloco"></div>
      <div class="esq-bloco"></div>
    </div>
    <div class="esq-bloco esq-grafico"></div>
  </div>
`;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/**
 * Escapa texto antes de inserir no HTML.
 * Os comentários são digitados por pessoas, então precisam ser tratados como
 * texto puro — sem isso, alguém poderia digitar uma tag <script> no formulário
 * e ela seria executada no navegador de quem abrir o painel (ataque XSS).
 */
function escaparHTML(texto) {
  if (texto === null || texto === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

/** Converte "2026-08-07 14:30:00" em "07/08 às 14:30" */
/**
 * Formata uma data para exibição, no formato "07/08 às 14:30".
 *
 * ATENÇÃO: o MongoDB devolve datas no formato ISO ("2026-08-07T14:30:00.000Z"),
 * diferente do banco anterior, que usava espaço entre data e hora. Recortar o
 * texto à mão quebrava com o formato novo — daí usarmos o Date do navegador,
 * que entende os dois e ainda converte para o fuso local automaticamente.
 */
function formatarDataHora(valor) {
  if (!valor) return '';

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';

  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const hora = String(data.getHours()).padStart(2, '0');
  const minuto = String(data.getMinutes()).padStart(2, '0');

  return `${dia}/${mes} às ${hora}:${minuto}`;
}

/** Converte "2026-08-07" em "07/08" para os rótulos do gráfico */
function formatarDiaCurto(texto) {
  const [, mes, dia] = texto.split('-');
  return `${dia}/${mes}`;
}

/**
 * Diz há quanto tempo foi a última resposta, em linguagem natural.
 * Assim como formatarDataHora, deixa o Date do navegador interpretar a data,
 * em vez de recortar o texto — que quebraria com o formato ISO do MongoDB.
 */
function tempoDesde(valor) {
  if (!valor) return 'sem registros';

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'sem registros';

  const minutos = Math.floor((Date.now() - data.getTime()) / 60000);

  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

/** Mapeia o nível de risco para a classe CSS correspondente */
function classeRisco(nivel) {
  return `risco-${nivel || 'indefinido'}`;
}

/**
 * Ícones dos alertas, desenhados em SVG.
 *
 * Antes eram os caracteres de texto ▲ ● ✓. Funcionavam, mas cada fonte do
 * sistema operacional desenha esses símbolos de um jeito — o triângulo do
 * Windows não é o mesmo peso visual do triângulo do Android — então o alerta
 * mudava de aparência dependendo de onde a apresentação rodasse. Um SVG
 * desenhado aqui é sempre o mesmo traço, em qualquer aparelho.
 *
 * currentColor: o ícone herda a cor do texto do alerta (.alerta.alto já é
 * vermelho, .alerta.medio já é âmbar), então não precisa de uma cor própria
 * nem duplica a lógica de qual tom usar em qual gravidade.
 */
const ICONES_ALERTA = {
  alto: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 1.5 15 14H1L8 1.5Zm0 4.2a.85.85 0 0 0-.85.85v3.4a.85.85 0 0 0 1.7 0v-3.4A.85.85 0 0 0 8 5.7Zm0 6.3a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9Z"/></svg>',
  medio: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="currentColor"/></svg>',
  ok: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5 6.3 12 13 4"/></svg>',
};

// Mesma razão dos ícones de alerta acima: sem isto, a seta de tendência era
// desenhada com os caracteres ▲ ▼ =, que mudam de peso visual conforme a
// fonte do sistema operacional. currentColor herda a cor do .selo que os
// envolve (risco-alto/risco-baixo), então não precisa de cor própria.
const ICONES_TENDENCIA = {
  piorando: '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M8 2 14 12H2L8 2Z"/></svg>',
  melhorando: '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M8 14 2 4h12L8 14Z"/></svg>',
  estavel: '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 6h10M3 10h10"/></svg>',
};

/**
 * Ícones dos cartões de resumo e dos títulos de painel.
 *
 * Mesma razão dos ícones acima (traço consistente entre aparelhos), com uma
 * regra a mais: aqui o ícone é sempre neutro (herda a tinta fraca do rótulo
 * que acompanha), nunca colorido — é etiqueta de categoria, não valor de
 * risco. Quem carrega a cor do semáforo continua sendo só o número e a
 * régua ao lado.
 */
const ICONES_CARTAO = {
  respostas: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.2" d="M4 1.8h6l2.5 2.5v9.9a.6.6 0 0 1-.6.6H4a.6.6 0 0 1-.6-.6V2.4a.6.6 0 0 1 .6-.6Z"/><path fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" d="M5.4 7h5.2M5.4 9.4h5.2M5.4 11.8h3.2"/></svg>',
  alvo: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1" fill="currentColor"/></svg>',
  alerta: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5 15 14H1L8 1.5Zm0 4.2a.85.85 0 0 0-.85.85v3.4a.85.85 0 0 0 1.7 0v-3.4A.85.85 0 0 0 8 5.7Zm0 6.3a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9Z"/></svg>',
};

const ICONES_SECAO = {
  grafico: '<svg viewBox="0 0 16 16" aria-hidden="true"><path stroke="currentColor" stroke-width="1.3" stroke-linecap="round" d="M2 13.5V2M2 13.5h12"/><rect x="4" y="9" width="2.2" height="4.3" rx="0.4" fill="currentColor"/><rect x="7.6" y="6" width="2.2" height="7.3" rx="0.4" fill="currentColor"/><rect x="11.2" y="3.3" width="2.2" height="10" rx="0.4" fill="currentColor"/></svg>',
  setor: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor"/><rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity=".55"/><rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity=".55"/><rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor"/></svg>',
  lista: '<svg viewBox="0 0 16 16" aria-hidden="true"><path stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M2 4h1.6M2 8h1.6M2 12h1.6M6 4h8M6 8h8M6 12h8"/></svg>',
  comentario: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.3" d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6.8L3.5 14v-2.5H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"/></svg>',
};

/** Se o token expirou ou não existe, manda de volta ao login */
function exigirSessao() {
  if (!Sessao.obterToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

/** Faz uma requisição autenticada e trata sessão expirada de forma central */
async function buscarAutenticado(url) {
  // requisitar() vem de login.js e já trata sessão expirada de forma central,
  // redirecionando para o login sem cada tela precisar repetir essa lógica.
  const resposta = await requisitar(url);
  if (!resposta.ok) {
    throw new Error('Falha ao buscar dados do servidor');
  }
  return resposta.json();
}

// ---------------------------------------------------------------------------
// Indicador de conexão
// ---------------------------------------------------------------------------

/**
 * Atualiza a bolinha de status no cabeçalho.
 * Serve para que uma falha de conexão fique visível na hora, em vez de o painel
 * simplesmente parar de atualizar sem ninguém perceber — o que seria péssimo no
 * meio de uma apresentação.
 */
function marcarConexao(estado) {
  const indicador = document.getElementById('indicador-conexao');
  if (!indicador) return;

  const bolinha = indicador.querySelector('.bolinha');
  const texto = indicador.querySelector('.texto-conexao');

  if (estado === 'ok') {
    ultimaAtualizacao = new Date();
    indicador.className = 'indicador-conexao ok';
    bolinha.title = 'Conectado';
    texto.textContent = 'atualizado agora';
  } else {
    indicador.className = 'indicador-conexao erro';
    bolinha.title = 'Sem conexão com o servidor';
    texto.textContent = ultimaAtualizacao
      ? `sem conexão · dados de ${formatarHora(ultimaAtualizacao)}`
      : 'sem conexão';
  }
}

function formatarHora(data) {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Mantém o texto "atualizado há X" correto entre uma busca e outra. */
function atualizarRotuloTempo() {
  const indicador = document.getElementById('indicador-conexao');
  if (!indicador || !ultimaAtualizacao) return;
  if (indicador.classList.contains('erro')) return;

  const segundos = Math.floor((Date.now() - ultimaAtualizacao.getTime()) / 1000);
  const texto = indicador.querySelector('.texto-conexao');

  if (segundos < 10) texto.textContent = 'atualizado agora';
  else if (segundos < 60) texto.textContent = `atualizado há ${segundos}s`;
  else {
    const minutos = Math.floor(segundos / 60);
    texto.textContent = `atualizado há ${minutos} min`;
  }
}

// ---------------------------------------------------------------------------
// Controle do temporizador
// ---------------------------------------------------------------------------

function iniciarAtualizacaoAutomatica() {
  pararAtualizacaoAutomatica();
  temporizador = setInterval(() => carregarPainel(true), INTERVALO_ATUALIZACAO);
}

function pararAtualizacaoAutomatica() {
  if (temporizador) {
    clearInterval(temporizador);
    temporizador = null;
  }
}

// Quando a aba sai de foco, paramos de atualizar: ninguém está vendo, e
// continuar buscando dados só gastaria banco e bateria à toa. Ao voltar,
// buscamos imediatamente, para a pessoa não ficar olhando dados velhos
// esperando o próximo ciclo de 20 segundos.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pararAtualizacaoAutomatica();
  } else {
    carregarPainel(true);
    iniciarAtualizacaoAutomatica();
  }
});

// ---------------------------------------------------------------------------
// Carregamento principal
// ---------------------------------------------------------------------------

/**
 * Carrega os dados do painel.
 *
 * @param silencioso quando true, não mostra "Carregando..." e não apaga a tela
 *   em caso de erro. Usado pela atualização automática: trocar o painel inteiro
 *   por uma mensagem de carregamento a cada 20 segundos faria a tela piscar e
 *   atrapalharia quem estivesse lendo os dados.
 */
async function carregarPainel(silencioso = false) {
  if (!exigirSessao()) return;

  // Na carga inicial, o próprio HTML já traz o esqueleto (dashboard.html) —
  // não precisa recriar aqui. Já ao trocar de período, o conteúdo anterior
  // ainda está na tela; sem repor o esqueleto, ficaria uma leitura antiga
  // parada até o novo período responder, o que parece trava, não carregamento.
  if (!silencioso && conteudo.dataset.montado === 'true') {
    // Segura a altura durante a troca. O esqueleto é bem mais baixo que o
    // painel cheio (medido: a página caía de ~5500px para ~1250px), então o
    // navegador grampeava a rolagem no novo fim. Quem estava lendo os
    // comentários lá embaixo via a página saltar para cima e voltar sozinha
    // quando o conteúdo chegava — o valor final é restaurado, mas o solavanco
    // no meio dura o tempo todo do carregamento e é bem visível com o banco
    // na nuvem. Com o banco em memória dos testes isso não aparece: a
    // resposta é rápida demais para o esqueleto chegar a existir na tela.
    // A altura volta a ser livre assim que o conteúdo novo entra.
    conteudo.style.minHeight = `${conteudo.offsetHeight}px`;
    conteudo.innerHTML = ESQUELETO_PAINEL;
  }
  conteudo.dataset.montado = 'true';

  try {
    // A busca vem em duas etapas de propósito. resumo já traz o suficiente
    // (geral.total e geral.ultima_resposta) para saber se algo mudou — buscar
    // evolução e comentários ANTES dessa checagem gastaria duas requisições a
    // cada ciclo de 20s só para descobrir, na maior parte das vezes, que os
    // números são os mesmos de antes.
    const resumo = await buscarAutenticado(`/api/respostas/resumo?periodo=${periodoAtual}`);

    subtituloPeriodo.textContent =
      `Indicadores de risco psicossocial reportados pela equipe · ${resumo.periodo}`;

    marcarConexao('ok');

    if (!resumo.geral || resumo.geral.total === 0) {
      mostrarVazio();
      return;
    }

    // Na atualização automática, só busca o resto e redesenha se algo
    // realmente mudou.
    //
    // Reconstruir o painel a cada 20 segundos faria a tela piscar, cancelaria a
    // animação dos gráficos e fecharia qualquer tooltip que a pessoa estivesse
    // lendo — tudo isso para, na maior parte das vezes, mostrar exatamente os
    // mesmos números. A assinatura abaixo detecta se houve resposta nova.
    const assinatura = `${resumo.geral.total}|${resumo.geral.ultima_resposta}|${periodoAtual}`;
    if (silencioso && assinatura === assinaturaAtual) {
      return;
    }
    assinaturaAtual = assinatura;

    const [evolucao, comentarios] = await Promise.all([
      buscarAutenticado(`/api/respostas/evolucao?periodo=${periodoAtual}`),
      buscarAutenticado(`/api/respostas/comentarios?periodo=${periodoAtual}`),
    ]);

    montarPainel(resumo, evolucao, comentarios);
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return; // já redirecionou
    console.error(erro);

    marcarConexao('erro');

    // Numa atualização automática que falhou, preferimos manter os dados
    // antigos na tela — desatualizados, mas úteis — em vez de trocar tudo por
    // uma mensagem de erro. O indicador de conexão já avisa o que houve.
    if (silencioso) return;

    conteudo.style.minHeight = ''; // ver a trava de altura em carregarPainel
    conteudo.innerHTML = `
      <div class="vazio">
        <div class="titulo-vazio">Não foi possível carregar</div>
        <p>Verifique se o servidor está rodando e tente novamente.</p>
        <button type="button" class="botao" data-recarregar>Tentar de novo</button>
      </div>
    `;
  }
}

function mostrarVazio() {
  conteudo.style.minHeight = ''; // ver a trava de altura em carregarPainel
  conteudo.innerHTML = `
    <div class="vazio">
      <div class="titulo-vazio">Nenhuma resposta neste período</div>
      <p>
        Assim que a equipe começar a preencher o formulário, os indicadores,
        alertas e recomendações aparecem aqui automaticamente.
      </p>
      <a href="index.html" class="botao">Abrir o formulário</a>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Montagem do painel
// ---------------------------------------------------------------------------

function montarPainel(resumo, evolucao, comentarios) {
  const { geral, porSetor, porTurno, indiceRisco, classificacao, alertas, recomendacoesPorSetor } = resumo;

  // O innerHTML logo abaixo recria a lista de comentários do zero. Sem
  // guardar e devolver a rolagem, quem estivesse lendo um comentário mais
  // antigo voltava pro topo da lista a cada atualização automática de 20s —
  // inclusive no meio de uma apresentação.
  const listaComentariosAntiga = conteudo.querySelector('.lista-comentarios');
  const rolagemComentarios = listaComentariosAntiga ? listaComentariosAntiga.scrollTop : 0;

  // A cascata de entrada é um gesto de CHEGADA: os blocos surgem um depois do
  // outro quando o painel abre. Ela vive no CSS e dispara sozinha sempre que
  // estes elementos nascem — e eles nascem de novo a cada innerHTML aqui.
  //
  // Os números continuam se reanimando na troca de período (primeiraMontagem
  // cuida disso, de propósito). O que não se repete é a chegada.
  conteudo.classList.toggle('sem-cascata', cascataJaAconteceu);

  conteudo.innerHTML = `
    <div id="secao-resumo">
      ${montarAlertas(alertas)}
      ${montarDestaque(geral, indiceRisco, classificacao, resumo.insights, resumo.periodo)}
      ${montarCartoes(geral, indiceRisco, classificacao, porSetor)}
      ${montarInsights(resumo.insights)}
    </div>

    <div class="painel painel-grafico" id="secao-graficos">
      <h2><span class="icone-titulo">${ICONES_SECAO.grafico}</span>Evolução do risco ao longo do tempo</h2>
      <p class="descricao-painel">
        Índice diário de 1 a 5. A linha subindo indica piora — é o sinal para agir
        antes que o quadro se agrave.
      </p>
      <div class="area-grafico alto"><canvas id="grafico-evolucao" role="img" aria-label="Gráfico de linha: evolução do índice de risco ao longo do tempo, escala de 1 a 5."></canvas></div>
    </div>

    <div id="secao-setores">
      <div class="duas-colunas">
        <div class="painel painel-grafico">
          <h2><span class="icone-titulo">${ICONES_SECAO.grafico}</span>Médias por indicador</h2>
          <p class="descricao-painel">
            Escala 1 a 5 conforme respondido no formulário.
          </p>
          <div class="area-grafico"><canvas id="grafico-indicadores" role="img" aria-label="Gráfico de barras: médias de estresse, sono, carga de trabalho e ambiente físico, escala de 1 a 5."></canvas></div>
        </div>

        <div class="painel painel-grafico">
          <h2><span class="icone-titulo">${ICONES_SECAO.setor}</span>Risco por setor</h2>
          <p class="descricao-painel">
            Índice combinado — maior significa mais risco.
          </p>
          <div class="area-grafico"><canvas id="grafico-setores" role="img" aria-label="Gráfico de barras horizontais: índice de risco combinado por setor, do maior para o menor."></canvas></div>
        </div>
      </div>

      <div class="painel${porTurno && porTurno.length > 0 ? ' painel-grafico' : ''}">
        <h2><span class="icone-titulo">${ICONES_SECAO.setor}</span>Risco por turno</h2>
        <p class="descricao-painel">
          O mesmo setor pode estar tranquilo de manhã e sobrecarregado à noite.
          Separar por turno revela diferenças que a média do dia esconde.
        </p>
        ${porTurno && porTurno.length > 0
          ? `<div class="area-grafico"><canvas id="grafico-turnos" role="img" aria-label="Gráfico de barras: índice de risco por turno de trabalho."></canvas></div>`
          : `<p class="vazio-simples">
               Nenhuma resposta neste período informou o turno. Respostas
               gravadas antes desse campo existir não entram nesta comparação.
             </p>`}
      </div>
    </div>

    <div class="painel" id="secao-recomendacoes">
      <h2><span class="icone-titulo">${ICONES_SECAO.lista}</span>O que fazer agora</h2>
      <p class="descricao-painel">
        Recomendações geradas a partir dos indicadores que passaram do limite
        de atenção, organizadas por setor.
      </p>
      ${montarRecomendacoes(recomendacoesPorSetor)}
    </div>

    <div class="painel" id="secao-comentarios">
      <h2><span class="icone-titulo">${ICONES_SECAO.comentario}</span>O que a equipe está dizendo</h2>
      <p class="descricao-painel">
        Comentários deixados no formulário. A barra colorida indica o nível de
        risco da resposta em que o comentário foi escrito.
      </p>
      ${montarComentarios(comentarios)}
    </div>
  `;

  const novaListaComentarios = conteudo.querySelector('.lista-comentarios');
  if (novaListaComentarios) novaListaComentarios.scrollTop = rolagemComentarios;

  // O escalonamento de entrada (ver "MOVIMENTO" no CSS) é feito por
  // :nth-of-type no style.css, que conta irmãos dentro do MESMO pai. Como
  // os painéis de setor e turno agora moram dentro de #secao-setores (para
  // a navegação rápida por âncora ter algo pra apontar), a contagem por
  // seletor CSS ficaria errada. Aplicar o atraso aqui, na ordem real em que
  // os painéis aparecem na tela, é mais simples do que reescrever o CSS
  // para um seletor que soubesse atravessar wrappers.
  conteudo.querySelectorAll('.painel').forEach((el, i) => {
    if (i < 6) el.style.animationDelay = `${0.34 + i * 0.06}s`;
  });

  // As animações só podem começar depois que o HTML está na tela, e só na
  // primeira montagem (ver primeiraMontagem).
  // A classe .sem-cascata (ligada lá em cima) troca a animação de entrada por
  // uma curta, mas NÃO consegue zerar o atraso: os atrasos da cascata são
  // declarados com :nth-of-type e, mesmo com um seletor mais específico e com
  // a forma abreviada de animation, o navegador seguiu aplicando o atraso
  // antigo — os blocos do topo trocavam na hora e os painéis de baixo ainda
  // esperavam meio segundo. Estilo direto no elemento não entra nessa
  // disputa: é o último a valer, sempre.
  // Conteúdo definitivo na tela: a altura volta a ser livre (ver a trava em
  // carregarPainel).
  conteudo.style.minHeight = '';

  if (cascataJaAconteceu) {
    conteudo
      .querySelectorAll('.lista-alertas, .grade-cartoes, .destaque, .painel')
      .forEach((bloco) => { bloco.style.animationDelay = '0s'; });
  }

  const devoAnimar = primeiraMontagem;
  animarEntrada({ animar: devoAnimar });
  primeiraMontagem = false;
  cascataJaAconteceu = true; // a chegada acontece uma vez só, por carregamento

  desenharGraficoEvolucao(evolucao, devoAnimar);
  desenharGraficoIndicadores(geral, devoAnimar);
  desenharGraficoSetores(porSetor, devoAnimar);
  desenharGraficoTurnos(porTurno, devoAnimar);

  // Ver o comentário completo em hashInicial e corrigirHashAte, lá em cima:
  // o hash foi tirado da URL antes de o navegador tentar rolar sozinho, e a
  // rolagem de verdade é feita aqui, manualmente, depois que o painel monta.
  // Só desarma de vez depois do prazo — dentro dele, qualquer nova montagem
  // (mesmo uma tardia, chegando bem depois de uma tentativa que já pareceu
  // ter dado certo) cancela a rolagem agendada e agenda outra para o
  // elemento atual, porque é o elemento da montagem MAIS RECENTE que importa.
  if (corrigirHashPendente) {
    if (Date.now() > corrigirHashAte) {
      corrigirHashPendente = false;
    } else {
      clearTimeout(temporizadorCorrigirHash);
      temporizadorCorrigirHash = setTimeout(() => {
        const alvo = document.querySelector(hashInicial);
        if (alvo) {
          history.replaceState(null, '', location.pathname + location.search + hashInicial);
          alvo.scrollIntoView();
        }
      }, 400);
    }
  }
}

/**
 * Monta o painel de leitura automática.
 *
 * Os textos vêm prontos do servidor (utils/insights.js), gerados por regras
 * explícitas — não por modelo de linguagem. Aqui só organizamos na tela.
 */
function montarInsights(insights) {
  if (!insights || !insights.geral) return '';

  const g = insights.geral;

  const blocosSetor = (insights.porSetor || []).map((s) => `
    <div class="insight-setor ${classeRisco(s.tipo)}">
      <div class="insight-cabecalho">
        <span class="insight-nome">${escaparHTML(s.setorNome)}</span>
        ${s.tendencia === 'piorando'
          ? `<span class="selo miudo risco-alto">${ICONES_TENDENCIA.piorando} piorando</span>`
          : s.tendencia === 'melhorando'
            ? `<span class="selo miudo risco-baixo">${ICONES_TENDENCIA.melhorando} melhorando</span>`
            : ''}
      </div>
      <p class="insight-texto">${escaparHTML(s.texto)}</p>
    </div>`).join('');

  const blocoTurnos = insights.turnos ? `
    <div class="insight-setor ${classeRisco(insights.turnos.tipo)}">
      <div class="insight-cabecalho">
        <span class="insight-nome">Comparação entre turnos</span>
      </div>
      <p class="insight-texto">${escaparHTML(insights.turnos.texto)}</p>
    </div>` : '';

  // A leitura geral ja aparece no bloco de destaque, no topo. Aqui ficam so
  // os detalhamentos — repetir o texto principal seria redundancia.
  if (!blocosSetor && !blocoTurnos) return '';

  return `
    <div class="painel">
      <h2><span class="icone-titulo">${ICONES_SECAO.setor}</span>Leitura por setor e turno</h2>
      <p class="descricao-painel">
        Detalhamento gerado automaticamente a partir dos números do painel.
      </p>
      <div class="insight-lista">${blocosSetor}${blocoTurnos}</div>
    </div>
  `;
}

function montarAlertas(alertas) {
  if (!alertas || alertas.length === 0) {
    return `
      <div class="lista-alertas" role="status" aria-live="polite">
        <div class="alerta tudo-certo">
          <span class="icone">${ICONES_ALERTA.ok}</span>
          <span>Nenhum setor em situação crítica no período. Continue acompanhando.</span>
        </div>
      </div>
    `;
  }

  const criticos = alertas.filter((a) => a.gravidade === 'alto');
  const medios = alertas.filter((a) => a.gravidade === 'medio');

  // Cada setor crítico ganha sua própria linha, com o motivo específico.
  const linhas = criticos.map((a) => `
    <div class="alerta alto">
      <span class="icone">${ICONES_ALERTA.alto}</span>
      <span>${escaparHTML(a.mensagem)}</span>
    </div>
  `);

  // Os de risco médio são agrupados numa linha só quando são muitos.
  // Uma lista com um alerta para cada setor deixa de ser alerta e vira ruído —
  // o olho perde os casos que realmente exigem ação hoje.
  if (medios.length > 2) {
    const nomes = medios.map((a) => a.setorNome || a.setor).join(', ');
    linhas.push(`
      <div class="alerta medio">
        <span class="icone">${ICONES_ALERTA.medio}</span>
        <span>${medios.length} setores em risco médio: ${escaparHTML(nomes)}. Vale acompanhar de perto.</span>
      </div>
    `);
  } else {
    medios.forEach((a) => {
      // A previsão só existe quando o setor ainda não é crítico e vem piorando
      // em ritmo constante. Fica junto do alerta, e não num cartão à parte,
      // porque é a mesma informação: quanto tempo resta para agir.
      // A mensagem vem em minúscula do servidor, para poder ser encaixada em
      // outros textos. Aqui ela começa uma frase nova.
      const previsao = a.previsao
        ? ` <strong class="alerta-previsao">${escaparHTML(
          a.previsao.mensagem.charAt(0).toUpperCase() + a.previsao.mensagem.slice(1),
        )}.</strong>`
        : '';
      linhas.push(`
        <div class="alerta medio">
          <span class="icone">${ICONES_ALERTA.medio}</span>
          <span>${escaparHTML(a.mensagem)}${previsao}</span>
        </div>
      `);
    });
  }

  return `<div class="lista-alertas" role="status" aria-live="polite">${linhas.join('')}</div>`;
}

/**
 * Desenha a régua de 1 a 5 — o elemento visual que dá identidade ao sistema.
 *
 * Todas as perguntas do formulário são escalas de 1 a 5, e o índice de risco
 * também. Mostrar a posição na régua, em vez de só o número, transforma um
 * valor que precisa ser interpretado numa leitura de relance.
 */
/**
 * Anima um número contando de um valor inicial até o valor final.
 *
 * POR QUE ISSO EXISTE: um número que aparece pronto na tela é lido e
 * esquecido. Um número que se forma na frente da pessoa segura o olhar por um
 * instante — tempo suficiente para ela registrar que aquilo é a informação
 * principal da tela.
 *
 * A duração é curta de propósito (900ms). Numa apresentação ao vivo, quem
 * assiste não pode ficar esperando a tela terminar de se montar.
 *
 * valorInicial normalmente é 0 (primeira vez que o número aparece), mas numa
 * atualização ao vivo com resposta nova é o valor que já estava na tela — ver
 * ultimosValoresAnimados em animarEntrada. Sem isso, "205" viraria "206"
 * recomeçando a contagem lá do zero a cada 20 segundos, que é exatamente a
 * distração que este recurso existe para evitar.
 */
function animarNumero(elemento, valorFinal, { casas = 2, duracao = 900, valorInicial = 0 } = {}) {
  // Quem pediu menos movimento no sistema recebe o valor direto, sem animação.
  const preferSemMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (preferSemMovimento || valorInicial === valorFinal) {
    elemento.textContent = valorFinal.toFixed(casas).replace('.', ',');
    return;
  }

  const inicio = performance.now();

  function passo(agora) {
    const decorrido = Math.min((agora - inicio) / duracao, 1);

    // Desaceleração no fim (ease-out): o número corre rápido no começo e
    // "assenta" no valor final, em vez de parar de repente.
    const progresso = 1 - Math.pow(1 - decorrido, 3);
    const valor = valorInicial + (valorFinal - valorInicial) * progresso;

    elemento.textContent = valor.toFixed(casas).replace('.', ',');

    if (decorrido < 1) requestAnimationFrame(passo);
  }

  requestAnimationFrame(passo);
}

/**
 * Dispara as animações de entrada do painel: números contando e réguas
 * preenchendo. Roda depois que o HTML já está na tela.
 */
function animarEntrada({ animar = true } = {}) {
  const preferSemMovimento =
    !animar || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Números marcados com data-animar contam do último valor mostrado (ou de
  // zero, na primeira vez que aparecem) até o valor novo.
  document.querySelectorAll('[data-animar]').forEach((el) => {
    const valor = parseFloat(el.dataset.animar);
    if (Number.isNaN(valor)) return;
    const casas = Number(el.dataset.casas ?? 2);
    const chave = el.dataset.chave;
    const valorInicial = chave ? (ultimosValoresAnimados[chave] ?? 0) : 0;
    animarNumero(el, valor, { casas, valorInicial });
    if (chave) ultimosValoresAnimados[chave] = valor;
  });

  // As réguas nascem com largura zero e crescem até a posição real. Como a
  // transição de largura já está no CSS, basta aplicar o valor final aqui —
  // num quadro seguinte, para o navegador registrar a mudança e animar.
  const preencher = () => {
    document.querySelectorAll('.regua-preenchida[data-largura]').forEach((el) => {
      el.style.width = `${el.dataset.largura}%`;
    });
  };

  if (preferSemMovimento) preencher();
  else requestAnimationFrame(() => requestAnimationFrame(preencher));
}

function montarRegua(indice, nivel, { miuda = false, comEscala = true } = {}) {
  // Converte o índice (1 a 5) em porcentagem da régua: 1 fica no início,
  // 5 no fim.
  const posicao = Math.max(0, Math.min(100, ((indice - 1) / 4) * 100));

  return `
    <div class="regua ${miuda ? 'miuda' : ''}" role="img"
         aria-label="Índice ${String(indice).replace('.', ',')} de 5, nível ${nivel}">
      <!-- Nasce com largura zero e recebe a largura real logo em seguida
           (ver animarEntrada). A transição do CSS faz o resto: a barra cresce
           da esquerda para a direita, como uma medição acontecendo. -->
      <div class="regua-preenchida ${classeRisco(nivel)}"
           data-largura="${posicao.toFixed(2)}" style="width: 0%"></div>
    </div>
    ${comEscala ? `
    <div class="regua-escala">
      <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
    </div>` : ''}
  `;
}

/**
 * Bloco de abertura: o índice e o que ele significa, lado a lado.
 *
 * Vem antes de qualquer gráfico de propósito — quem abre o painel deve
 * entender a situação sem precisar interpretar barra nenhuma.
 */
function montarDestaque(geral, indiceRisco, classificacao, insights, periodo) {
  const leitura = insights && insights.geral ? insights.geral : null;

  return `
    <section class="destaque">
      <div class="destaque-medida">
        <div class="sobrescrito">Índice geral de risco</div>
        <div class="indice-grande ${classeRisco(classificacao.nivel)}">
          <span data-animar="${indiceRisco}" data-casas="2" data-chave="indice">0,00</span><span class="de">de 5,0</span>
        </div>
        ${montarRegua(indiceRisco, classificacao.nivel)}
        <span class="selo ${classeRisco(classificacao.nivel)}">${classificacao.rotulo}</span>
      </div>
      <div class="destaque-leitura">
        <div class="sobrescrito">Leitura do período · ${escaparHTML(periodo)}</div>
        <h2 class="destaque-titulo">${leitura ? escaparHTML(leitura.titulo) : 'Sem leitura disponível'}</h2>
        <p class="destaque-texto">${leitura ? escaparHTML(leitura.texto) : ''}</p>
      </div>
    </section>
  `;
}

function montarCartoes(geral, indiceRisco, classificacao, porSetor) {
  // Encontra o setor com pior índice, para destacar quem precisa de atenção
  const pior = porSetor.reduce(
    (maior, s) => (!maior || s.indiceRisco > maior.indiceRisco ? s : maior),
    null
  );

  const emAlerta = porSetor.filter((s) => s.classificacao.nivel === 'alto').length;

  return `
    <div class="grade-cartoes">
      <div class="cartao">
        <div class="rotulo"><span class="icone-cartao">${ICONES_CARTAO.respostas}</span>Respostas no período</div>
        <div class="valor"><span data-animar="${geral.total}" data-casas="0" data-chave="total">0</span></div>
        <div class="nota">última ${tempoDesde(geral.ultima_resposta)}</div>
      </div>
      <div class="cartao">
        <div class="rotulo"><span class="icone-cartao">${ICONES_CARTAO.alvo}</span>Setor que mais preocupa</div>
        <div class="valor valor-nome ${pior ? classeRisco(pior.classificacao.nivel) : ''}">
          ${pior ? escaparHTML(pior.setorNome || pior.setor) : '—'}
        </div>
        ${pior ? montarRegua(pior.indiceRisco, pior.classificacao.nivel, { miuda: true, comEscala: false }) : ''}
        <div class="nota">${pior ? `índice ${String(pior.indiceRisco).replace('.', ',')}` : 'sem dados'}</div>
      </div>
      <div class="cartao">
        <div class="rotulo"><span class="icone-cartao">${ICONES_CARTAO.alerta}</span>Setores em risco alto</div>
        <div class="valor ${emAlerta > 0 ? 'risco-alto' : 'risco-baixo'}"><span data-animar="${emAlerta}" data-casas="0" data-chave="emAlerta">0</span></div>
        <div class="nota">de ${porSetor.length} monitorado${porSetor.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
  `;
}

function montarRecomendacoes(recomendacoesPorSetor) {
  if (!recomendacoesPorSetor || recomendacoesPorSetor.length === 0) {
    return `
      <p class="vazio-simples">
        Nenhum indicador passou do limite de atenção neste período.
        Vale manter o acompanhamento e incentivar o preenchimento contínuo.
      </p>
    `;
  }

  return recomendacoesPorSetor.map((setor) => {
    const blocos = setor.recomendacoes.map((r) => `
      <div class="bloco-recomendacao">
        <div class="titulo-rec">
          ${escaparHTML(r.titulo)}
          ${r.mediaBruta !== null && r.mediaBruta !== undefined
            ? `<span class="media-rec">média ${String(r.mediaBruta).replace('.', ',')} de 5,0</span>`
            : ''}
        </div>
        <ul>
          ${r.acoes.map((a) => `<li>${escaparHTML(a)}</li>`).join('')}
        </ul>
      </div>
    `).join('');

    return `
      <div class="setor-recomendacao">
        <div class="cabecalho-setor">
          <span class="nome">${escaparHTML(setor.setorNome || setor.setor)}</span>
          <span class="selo miudo ${classeRisco(setor.classificacao.nivel)}">
            ${setor.classificacao.rotulo}
          </span>
          ${montarTendencia(setor)}
          <span class="contagem">${setor.total} respostas · índice ${setor.indiceRisco}</span>
        </div>
        ${setor.urgencia ? `<div class="faixa-urgencia urgencia-${setor.urgencia.peso}">
          <strong>${escaparHTML(setor.urgencia.rotulo)}</strong>
          ${escaparHTML(setor.urgencia.descricao)}
        </div>` : ''}
        ${blocos}
        <div class="acao-alerta">
          ${setor.ultimaAcao
            ? `<span class="acao-alerta-registrada">Ação registrada em
                ${formatarDataHora(setor.ultimaAcao.criadoEm)} por
                ${escaparHTML(setor.ultimaAcao.criadoPor)}${montarEfeitoAcao(setor.ultimaAcao.efeito)}</span>`
            : `<button type="button" class="botao-acao-alerta" data-acao-setor="${escaparHTML(setor.setor)}">
                Marcar ação tomada
              </button>`}
        </div>
      </div>
    `;
  }).join('');
}

// Rótulos e classe de cor para o resultado da comparação antes/depois de uma
// ação. Cor só entra aqui porque é, de fato, uma leitura de risco (melhorou =
// risco caindo, piorou = risco subindo) — a mesma disciplina de cor usada no
// resto do sistema, não uma exceção nova.
const EFEITO_ACAO = {
  melhorou: { rotulo: 'melhorou', classe: 'efeito-melhorou' },
  piorou: { rotulo: 'piorou', classe: 'efeito-piorou' },
  estavel: { rotulo: 'ficou estável', classe: 'efeito-estavel' },
};

/**
 * Texto complementar comparando o índice do setor antes e depois da ação
 * registrada. Não aparece enquanto não houver respostas suficientes dos dois
 * lados — ver calcularEfeitoAcao em routes/respostas.js.
 */
function montarEfeitoAcao(efeito) {
  if (!efeito) return '';
  const info = EFEITO_ACAO[efeito.direcao];
  const antes = String(efeito.indiceAntes).replace('.', ',');
  const depois = String(efeito.indiceDepois).replace('.', ',');
  return ` · <span class="efeito-acao ${info.classe}">índice ${info.rotulo} depois (${antes} → ${depois})</span>`;
}

/**
 * Etiqueta de tendência ao lado do nome do setor.
 * Só aparece quando há dias suficientes para a leitura ser confiável — mostrar
 * uma seta baseada em dois dias seria apresentar chute como informação.
 */
function montarTendencia(setor) {
  const t = setor.tendencia;
  if (!t || !t.confiavel) return '';

  const classes = { piorando: 'risco-alto', melhorando: 'risco-baixo', estavel: '' };

  const detalhe = t.direcao === 'piorando' && setor.diasPiorando >= 2
    ? ` há ${setor.diasPiorando} dias`
    : '';

  return `<span class="selo miudo ${classes[t.direcao] || 'neutro'}"
    title="Comparação entre o começo e o fim do período (${t.diasAnalisados} dias)">
    ${ICONES_TENDENCIA[t.direcao] || ''} ${escaparHTML(t.rotulo)}${detalhe}
  </span>`;
}

function montarComentarios(dados) {
  // A rota agora devolve { comentarios, ocultos, minimo } em vez de uma lista
  // solta, porque o painel precisa saber o que foi escondido para poder dizer.
  const comentarios = dados?.comentarios || [];
  const ocultos = dados?.ocultos || 0;
  const minimo = dados?.minimo || 0;

  // Explica a ausência em vez de deixar o gestor achar que o dado sumiu.
  const aviso = ocultos > 0
    ? `<p class="nota-anonimato">
         ${ocultos === 1
           ? '1 comentário está oculto'
           : `${ocultos} comentários estão ocultos`}
         para proteger o anonimato: setores com menos de ${minimo} respostas no
         período são pequenos demais para que um texto livre não identifique
         quem escreveu.
       </p>`
    : '';

  if (comentarios.length === 0) {
    return `
      ${aviso}
      <p class="vazio-simples">
        Nenhum comentário disponível neste período. O campo de texto do
        formulário é opcional — nem toda resposta traz um.
      </p>
    `;
  }

  const itens = comentarios.map((c) => `
    <div class="comentario ${classeRisco(c.classificacao.nivel)}">
      <div class="meta">
        <span class="setor-nome">${escaparHTML(c.setorNome || c.setor)}</span>
        <span>${escaparHTML(c.data)}</span>
        <span class="selo miudo ${classeRisco(c.classificacao.nivel)}">${c.classificacao.rotulo}</span>
      </div>
      <div class="texto">${escaparHTML(c.comentario)}</div>
    </div>
  `).join('');

  return `${aviso}<div class="lista-comentarios">${itens}</div>`;
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------

// Configurações visuais repetidas em todos os gráficos.
//
// O Chart.js desenha em canvas e não enxerga as variáveis do CSS. Antes as
// cores ficavam copiadas aqui em hexadecimal, com um aviso de "se mudarem no
// style.css, mudam aqui também" — e foi exatamente isso que se perdeu quando o
// sistema trocou de tema: o painel ficou escuro e os gráficos continuaram
// desenhando em cores de fundo claro. Agora as cores são LIDAS da folha de
// estilo, então existe um lugar só onde a paleta mora.
//
// O valor de reserva cobre o caso de a folha não ter carregado ainda: o
// gráfico sai com uma cor plausível em vez de sem cor nenhuma.
function corDoTema(nome, reserva) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome);
  return (v && v.trim()) || reserva;
}

const CORES = {
  texto: corDoTema('--tinta', '#F4EFE6'),
  textoFraco: corDoTema('--tinta-fraca', '#8F8677'),
  grade: corDoTema('--linha', '#302A24'),
  baixo: corDoTema('--baixo', '#8FC49B'),
  medio: corDoTema('--medio', '#D9A94C'),
  alto: corDoTema('--alto', '#D9705E'),
  marca: corDoTema('--marca', '#E8DCC8'),
  face: corDoTema('--superficie-2', '#221D19'),
};

// O Chart.js desenha em canvas e não herda a tipografia do CSS sozinho — sem
// isto, os rótulos e o tooltip saem no sans-serif genérico do navegador,
// destoando do resto da interface, que só usa Manrope, Instrument Serif e
// JetBrains Mono. displayColors sai porque todo gráfico daqui tem uma série
// só: o quadrado de cor no tooltip repetiria uma informação que a própria
// barra já mostra.
Chart.defaults.font.family = "'Manrope', system-ui, -apple-system, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = CORES.textoFraco;
Chart.defaults.plugins.tooltip.backgroundColor = CORES.face;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.displayColors = false;
Chart.defaults.plugins.tooltip.titleFont = { family: Chart.defaults.font.family, size: 12, weight: '600' };
Chart.defaults.plugins.tooltip.bodyFont = { family: Chart.defaults.font.family, size: 12 };

function corPorIndice(indice) {
  if (indice <= 2.2) return CORES.baixo;
  if (indice <= 3.4) return CORES.medio;
  return CORES.alto;
}

function eixosPadrao(tituloY) {
  return {
    y: {
      min: 1,
      max: 5,
      ticks: { color: CORES.textoFraco, stepSize: 1 },
      grid: { color: CORES.grade },
      title: tituloY
        ? { display: true, text: tituloY, color: CORES.textoFraco, font: { size: 11 } }
        : { display: false },
    },
    x: {
      ticks: { color: CORES.texto },
      grid: { display: false },
    },
  };
}

function destruirGrafico(nome) {
  if (graficos[nome]) {
    graficos[nome].destroy();
    delete graficos[nome];
  }
}

/**
 * Configuração de animação dos gráficos.
 *
 * MESMA REGRA DOS NÚMEROS E DA RÉGUA: anima na primeira carga da página e ao
 * trocar de período — momentos em que a leitura é nova e vale sinalizar que os
 * dados mudaram. NÃO anima no ciclo automático de 20 segundos: um painel que
 * fica aberto na parede durante a feira redesenhando os quatro gráficos a cada
 * 20s viraria distração constante, e quem estivesse lendo perderia a linha.
 *
 * 320ms cabe na faixa de 200-400ms combinada para todo o movimento do sistema
 * — rápido o bastante para não fazer a plateia esperar a tela "se montar".
 *
 * Respeita prefers-reduced-motion: o CSS não alcança canvas, então a checagem
 * precisa acontecer aqui no JavaScript.
 */
function animacaoGrafico(animar) {
  const prefereMenosMovimento =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!animar || prefereMenosMovimento) return false; // false desliga no Chart.js

  return {
    duration: 320,
    easing: 'easeOutQuart',
  };
}

function desenharGraficoEvolucao(serie, animar = false) {
  destruirGrafico('evolucao');
  const ctx = document.getElementById('grafico-evolucao');
  if (!ctx || !serie || serie.length === 0) return;

  graficos.evolucao = new Chart(ctx, {
    type: 'line',
    data: {
      labels: serie.map((d) => formatarDiaCurto(d.dia)),
      datasets: [{
        label: 'Índice de risco',
        data: serie.map((d) => d.indiceRisco),
        borderColor: CORES.marca,
        // Preenchimento sob a linha: creme com opacidade muito baixa. No fundo
        // escuro, qualquer coisa mais forte vira uma mancha que compete com os
        // pontos coloridos, que são o que realmente carrega a leitura.
        backgroundColor: 'rgba(232, 220, 200, 0.06)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        // Cada ponto ganha a cor do seu próprio nível de risco: assim dá para
        // ver no gráfico exatamente em que dia o quadro virou crítico.
        pointBackgroundColor: serie.map((d) => corPorIndice(d.indiceRisco)),
        pointBorderColor: serie.map((d) => corPorIndice(d.indiceRisco)),
      }],
    },
    options: {
      responsive: true,
      animation: animacaoGrafico(animar),
      maintainAspectRatio: false, // a altura vem do container .area-grafico
      scales: eixosPadrao('Índice (1 a 5)'),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (item) => `${serie[item.dataIndex].total} resposta(s) no dia`,
          },
        },
      },
    },
  });
}

function desenharGraficoIndicadores(geral, animar = false) {
  destruirGrafico('indicadores');
  const ctx = document.getElementById('grafico-indicadores');
  if (!ctx) return;

  // Cada barra mostra a nota bruta (como foi respondida), mas é COLORIDA pela
  // nota de risco correspondente. Isso importa porque as escalas apontam para
  // lados opostos: 3,0 de estresse é preocupante, enquanto 3,0 de sono é apenas
  // mediano. Pintar tudo da mesma cor faria o painel dizer que as duas situações
  // são iguais — e elas não são.
  const indicadores = [
    { chave: 'estresse', rotulo: 'Estresse', valor: geral.media_estresse, invertido: false },
    { chave: 'sono', rotulo: 'Sono', valor: geral.media_sono, invertido: true },
    { chave: 'carga_trabalho', rotulo: 'Carga', valor: geral.media_carga_trabalho, invertido: false },
    { chave: 'ambiente_fisico', rotulo: 'Ambiente', valor: geral.media_ambiente_fisico, invertido: true },
  ];

  const cores = indicadores.map((i) => {
    const notaDeRisco = i.invertido ? 6 - i.valor : i.valor;
    return corPorIndice(notaDeRisco);
  });

  graficos.indicadores = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: indicadores.map((i) => i.rotulo),
      datasets: [{
        data: indicadores.map((i) => i.valor),
        backgroundColor: cores,
        // A nota de risco de cada barra fica guardada junto do dado porque a
        // cor NÃO sai do valor plotado aqui (ver o comentário acima: sono e
        // ambiente apontam para o lado contrário). Quem repinta o gráfico
        // depois — a troca de paleta da impressão — precisa desta lista para
        // não pintar "dormiu bem" de vermelho.
        notasDeRisco: indicadores.map((i) => (i.invertido ? 6 - i.valor : i.valor)),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      animation: animacaoGrafico(animar),
      maintainAspectRatio: false, // a altura vem do container .area-grafico
      scales: eixosPadrao(),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // Explica no tooltip que nem toda nota alta é ruim — essa é a
            // principal fonte de confusão ao ler este gráfico.
            afterLabel: (item) => {
              const i = indicadores[item.dataIndex];
              const notaDeRisco = i.invertido ? 6 - i.valor : i.valor;
              const direcao = i.invertido ? 'Nota alta = situação boa' : 'Nota alta = situação ruim';
              return [direcao, `Equivale a risco ${notaDeRisco.toFixed(1)} de 5,0`];
            },
          },
        },
      },
    },
  });
}

function desenharGraficoSetores(porSetor, animar = false) {
  destruirGrafico('setores');
  const ctx = document.getElementById('grafico-setores');
  if (!ctx) return;

  // Ordena do pior para o melhor: o olho vai direto para o problema
  const ordenado = [...porSetor].sort((a, b) => b.indiceRisco - a.indiceRisco);

  graficos.setores = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ordenado.map((s) => s.setorNome || s.setor),
      datasets: [{
        data: ordenado.map((s) => s.indiceRisco),
        backgroundColor: ordenado.map((s) => corPorIndice(s.indiceRisco)),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y', // barras horizontais: nomes de setor cabem melhor
      responsive: true,
      animation: animacaoGrafico(animar),
      maintainAspectRatio: false, // a altura vem do container .area-grafico
      scales: {
        x: { min: 1, max: 5, ticks: { color: CORES.textoFraco, stepSize: 1 }, grid: { color: CORES.grade } },
        y: { ticks: { color: CORES.texto }, grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (item) => `${ordenado[item.dataIndex].total} resposta(s)`,
          },
        },
      },
    },
  });
}

function desenharGraficoTurnos(porTurno, animar = false) {
  destruirGrafico('turnos');
  const ctx = document.getElementById('grafico-turnos');
  if (!ctx || !porTurno || porTurno.length === 0) return;

  graficos.turnos = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: porTurno.map((t) => t.turnoNome),
      datasets: [{
        data: porTurno.map((t) => t.indiceRisco),
        backgroundColor: porTurno.map((t) => corPorIndice(t.indiceRisco)),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      animation: animacaoGrafico(animar),
      maintainAspectRatio: false, // a altura vem do container .area-grafico
      scales: eixosPadrao('Índice de risco (1 a 5)'),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (item) => {
              const t = porTurno[item.dataIndex];
              return [
                `${t.total} resposta(s)`,
                `Nível: ${t.classificacao.rotulo}`,
                `Sono médio: ${t.media_sono.toFixed(1)} de 5`,
              ];
            },
          },
        },
      },
    },
  });
}

// O botão "Marcar ação tomada" nasce dentro de HTML gerado por template
// string (montarRecomendacoes) e é recriado a cada carregarPainel — então o
// clique é ouvido no container estável (#conteudo) e filtrado pelo atributo,
// em vez de um addEventListener por botão que se perderia no próximo redesenho.
// O botão "Tentar de novo" da tela de erro nasce dentro de template string e
// é recriado a cada falha. Antes ele usava onclick="" no próprio HTML, o que
// a política de conteúdo do sistema (script-src 'self', sem 'unsafe-inline')
// bloqueia — ou seja, o botão de recuperação não fazia nada justamente quando
// era necessário. Ouvir o clique no container resolve sem afrouxar a política.
conteudo.addEventListener('click', (evento) => {
  if (evento.target.closest('[data-recarregar]')) carregarPainel();
});

conteudo.addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-acao-setor]');
  if (!botao) return;

  const setor = botao.dataset.acaoSetor;
  botao.disabled = true;
  botao.textContent = 'Registrando...';

  try {
    const resposta = await requisitar(`/api/respostas/setores/${setor}/acao`, { method: 'POST' });
    if (!resposta.ok) throw new Error('Falha ao registrar ação');

    // Recarrega o painel para trocar o botão pela etiqueta "ação registrada"
    // vinda do servidor — mais simples e confiável do que remontar só o
    // cartão à mão, e é a mesma chamada já usada ao trocar de período.
    await carregarPainel();
  } catch (erro) {
    console.error(erro);
    botao.disabled = false;
    botao.textContent = 'Erro ao registrar — tentar de novo';
  }
});

// ---------------------------------------------------------------------------
// Controles: filtro, exportação e saída
// ---------------------------------------------------------------------------

botoesPeriodo.forEach((botao) => {
  botao.addEventListener('click', () => {
    periodoAtual = botao.dataset.periodo;
    botoesPeriodo.forEach((b) => b.classList.remove('ativo'));
    botao.classList.add('ativo');

    // Zera a assinatura para garantir que o painel redesenhe: os dados do
    // período novo podem coincidir em total com os do anterior, e sem isso a
    // verificação de "nada mudou" bloquearia a troca.
    assinaturaAtual = null;

    // Trocar de período é uma leitura nova, não uma atualização de fundo:
    // vale reanimar para deixar claro que os números mudaram.
    primeiraMontagem = true;

    carregarPainel();

    // Reinicia a contagem: acabou de atualizar agora, o próximo ciclo
    // automático deve partir daqui.
    iniciarAtualizacaoAutomatica();
  });
});

// A exportação precisa passar pelo fetch (e não por um link direto) porque
// o servidor exige o cabeçalho de autenticação. Por isso baixamos o arquivo
// como blob e disparamos o download por código.
botaoExportar.addEventListener('click', async () => {
  if (!exigirSessao()) return;

  const textoOriginal = botaoExportar.textContent;
  botaoExportar.textContent = 'Gerando...';
  botaoExportar.disabled = true;

  try {
    const resposta = await requisitar(`/api/respostas/exportar?periodo=${periodoAtual}`);
    if (!resposta.ok) throw new Error('Falha ao exportar');

    const blob = await resposta.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `riscozero-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // libera a memória usada pelo blob

    botaoExportar.textContent = 'Baixado!';
    setTimeout(() => { botaoExportar.textContent = textoOriginal; }, 2000);
  } catch (erro) {
    console.error(erro);
    botaoExportar.textContent = 'Erro ao exportar';
    setTimeout(() => { botaoExportar.textContent = textoOriginal; }, 2500);
  } finally {
    botaoExportar.disabled = false;
  }
});

// A folha de estilo de impressão (style.css, @media print) já esconde
// cabeçalho, rodapé e controles e evita cortar cartões entre páginas — o
// botão só precisa disparar a impressão do navegador, que também é o "Salvar
// como PDF" de qualquer impressora do sistema.
botaoExportarPDF.addEventListener('click', () => {
  window.print();
});

// ---------------------------------------------------------------------------
// Os gráficos também precisam trocar de tema para o papel
//
// O @media print reverte a página para claro, mas gráfico é <canvas>: já foi
// DESENHADO com as cores da tela e não muda sozinho quando a folha de
// impressão entra. Sem isto, a linha da evolução (creme, feita para fundo
// escuro) sai invisível no papel branco e as barras saem claras demais.
//
// Então trocamos a paleta, redesenhamos, e devolvemos tudo ao normal quando a
// impressão termina. Os mesmos tons do @media print, pelo mesmo motivo:
// escuros o bastante para sobreviver a uma impressora ruim.
// ---------------------------------------------------------------------------

const PALETA_TELA = { ...CORES };
const PALETA_PAPEL = {
  texto: '#0D1B2A',
  textoFraco: '#5E6E7D',
  grade: '#DCE3E9',
  baixo: '#14804A',
  medio: '#8F5A04',
  alto: '#B8342A',
  marca: '#1B3FA0',
  face: '#FFFFFF',
};

function aplicarPaleta(paleta) {
  Object.assign(CORES, paleta);
  Chart.defaults.color = CORES.textoFraco;
  Chart.defaults.plugins.tooltip.backgroundColor = CORES.face;

  for (const grafico of Object.values(graficos)) {
    for (const eixo of Object.values(grafico.options.scales || {})) {
      if (eixo.ticks) eixo.ticks.color = eixo === grafico.options.scales.x ? CORES.texto : CORES.textoFraco;
      if (eixo.grid && eixo.grid.color) eixo.grid.color = CORES.grade;
      if (eixo.title && eixo.title.display) eixo.title.color = CORES.textoFraco;
    }

    // Na maioria dos gráficos a cor sai do próprio valor plotado, então
    // recalcular com a paleta nova basta. A exceção é o gráfico de
    // indicadores, onde a barra mostra a nota bruta e a cor vem da nota de
    // RISCO — que é o contrário do valor em sono e ambiente físico. Lá o
    // conjunto carrega notasDeRisco, e é ela que manda.
    for (const conjunto of grafico.data.datasets) {
      const base = conjunto.notasDeRisco || conjunto.data;
      if (grafico.config.type === 'line') {
        conjunto.borderColor = CORES.marca;
        conjunto.pointBackgroundColor = base.map(corPorIndice);
        conjunto.pointBorderColor = base.map(corPorIndice);
      } else {
        conjunto.backgroundColor = base.map(corPorIndice);
      }
    }

    grafico.update('none'); // 'none' = sem animação: a impressão não espera
  }
}

window.addEventListener('beforeprint', () => aplicarPaleta(PALETA_PAPEL));
window.addEventListener('afterprint', () => aplicarPaleta(PALETA_TELA));

// ---------------------------------------------------------------------------
// Modo apresentação
//
// Um tablet ou notebook ligado a um telão na feira não precisa de cabeçalho,
// filtros nem rodapé — só a leitura. Soma o layout enxuto (CSS) a um pedido
// de tela cheia do navegador; se o navegador negar (comum fora de um gesto
// direto do usuário, o que este clique já é), o layout enxuto sozinho ainda
// entrega a maior parte do ganho.
// ---------------------------------------------------------------------------

const botaoApresentacao = document.getElementById('botao-apresentacao');

function redimensionarGraficos() {
  // Mudar a altura do container (.area-grafico) não redimensiona sozinho um
  // <canvas> que o Chart.js já desenhou — sem isto os gráficos ficam com a
  // altura antiga até a próxima atualização automática.
  Object.values(graficos).forEach((g) => g.resize());
}

if (botaoApresentacao) {
  botaoApresentacao.addEventListener('click', async () => {
    const ativo = document.body.classList.toggle('modo-apresentacao');
    botaoApresentacao.textContent = ativo ? 'Sair da apresentação' : 'Modo apresentação';
    redimensionarGraficos();

    try {
      if (ativo && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (!ativo && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (erro) {
      // Alguns navegadores negam tela cheia (iframe, política do site); o
      // layout enxuto continua funcionando normalmente sem ela.
    }
  });

  // Se a pessoa sair da tela cheia pelo Esc do próprio navegador (em vez do
  // botão), o layout enxuto sozinho ficaria "preso" ligado sem ninguém ter
  // pedido — este listener mantém os dois estados em sincronia.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('modo-apresentacao')) {
      document.body.classList.remove('modo-apresentacao');
      botaoApresentacao.textContent = 'Modo apresentação';
      redimensionarGraficos();
    }
  });

  // Saída garantida mesmo quando o navegador nega o pedido de tela cheia
  // (comum fora de certos contextos) — sem isto, o Esc não faria nada e só
  // sobraria o botão flutuante no canto para voltar ao layout normal.
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && document.body.classList.contains('modo-apresentacao')) {
      document.body.classList.remove('modo-apresentacao');
      botaoApresentacao.textContent = 'Modo apresentação';
      redimensionarGraficos();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  });
}

botaoSair.addEventListener('click', async () => {
  try {
    await requisitar('/api/auth/logout', { method: 'POST' });
  } catch (erro) {
    // Mesmo se a chamada falhar, limpamos o token local e saímos:
    // o importante é que a sessão não continue aberta neste navegador.
    console.error(erro);
  }
  Sessao.limpar();
  window.location.href = 'login.html';
});

// Mostra quem está logado e libera o link de usuários apenas para admins.
// A checagem aqui é só de interface — quem realmente bloqueia o acesso é o
// servidor, em middleware/auth.js. Esconder o link evita mostrar uma opção
// que daria erro, mas não é a proteção de verdade.
function ajustarCabecalho() {
  const usuario = Sessao.obterUsuario();
  if (!usuario) return;

  const rotulo = document.getElementById('usuario-logado');
  if (rotulo) {
    const primeiroNome = usuario.nome.split(' ')[0];
    rotulo.textContent = usuario.papel === 'admin' ? `${primeiroNome} (admin)` : primeiroNome;
  }

  if (usuario.papel === 'admin') {
    ['link-usuarios', 'link-chaves', 'link-acessos'].forEach((id) => {
      const link = document.getElementById(id);
      if (link) link.style.display = '';
    });
  }
}

// WebSockets: atualiza o painel assim que alguém responde o formulário ou
// registra uma ação, sem esperar o próximo ciclo do polling. O polling
// continua rodando de qualquer forma (iniciarAtualizacaoAutomatica, abaixo)
// — se o socket cair (rede instável, hospedagem gratuita reiniciando), o
// painel ainda se atualiza sozinho a cada INTERVALO_ATUALIZACAO.
if (typeof io === 'function') {
  const socket = io();
  socket.on('painel:atualizado', () => carregarPainel(true));
}

// Início
ajustarCabecalho();
carregarPainel();
iniciarAtualizacaoAutomatica();

// Atualiza só o texto "há X segundos" a cada 5s, sem tocar no banco
setInterval(atualizarRotuloTempo, 5000);
