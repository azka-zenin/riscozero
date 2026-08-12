// dashboard.js
// Monta todo o painel de gestão: alertas, cartões, gráficos, recomendações
// e comentários. Depende de login.js, que fornece o objeto Sessao.

const conteudo = document.getElementById('conteudo');
const subtituloPeriodo = document.getElementById('subtitulo-periodo');
const botoesPeriodo = document.querySelectorAll('.filtro-periodo button');
const botaoExportar = document.getElementById('botao-exportar');
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
  medio: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="currentColor"/></svg>',
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
    conteudo.innerHTML = ESQUELETO_PAINEL;
  }
  conteudo.dataset.montado = 'true';

  try {
    const [resumo, evolucao, comentarios] = await Promise.all([
      buscarAutenticado(`/api/respostas/resumo?periodo=${periodoAtual}`),
      buscarAutenticado(`/api/respostas/evolucao?periodo=${periodoAtual}`),
      buscarAutenticado(`/api/respostas/comentarios?periodo=${periodoAtual}`),
    ]);

    subtituloPeriodo.textContent =
      `Indicadores de risco psicossocial reportados pela equipe · ${resumo.periodo}`;

    marcarConexao('ok');

    if (!resumo.geral || resumo.geral.total === 0) {
      mostrarVazio();
      return;
    }

    // Na atualização automática, só redesenha se algo realmente mudou.
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

    montarPainel(resumo, evolucao, comentarios);
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return; // já redirecionou
    console.error(erro);

    marcarConexao('erro');

    // Numa atualização automática que falhou, preferimos manter os dados
    // antigos na tela — desatualizados, mas úteis — em vez de trocar tudo por
    // uma mensagem de erro. O indicador de conexão já avisa o que houve.
    if (silencioso) return;

    conteudo.innerHTML = `
      <div class="vazio">
        <div class="titulo-vazio">Não foi possível carregar</div>
        <p>Verifique se o servidor está rodando e tente novamente.</p>
        <button type="button" class="botao" onclick="carregarPainel()">Tentar de novo</button>
      </div>
    `;
  }
}

function mostrarVazio() {
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

  conteudo.innerHTML = `
    ${montarAlertas(alertas)}
    ${montarDestaque(geral, indiceRisco, classificacao, resumo.insights, resumo.periodo)}
    ${montarCartoes(geral, indiceRisco, classificacao, porSetor)}
    ${montarInsights(resumo.insights)}

    <div class="painel">
      <h2>Evolução do risco ao longo do tempo</h2>
      <p class="descricao-painel">
        Índice diário de 1 a 5. A linha subindo indica piora — é o sinal para agir
        antes que o quadro se agrave.
      </p>
      <div class="area-grafico alto"><canvas id="grafico-evolucao" role="img" aria-label="Gráfico de linha: evolução do índice de risco ao longo do tempo, escala de 1 a 5."></canvas></div>
    </div>

    <div class="duas-colunas">
      <div class="painel">
        <h2>Médias por indicador</h2>
        <p class="descricao-painel">
          Escala 1 a 5 conforme respondido no formulário.
        </p>
        <div class="area-grafico"><canvas id="grafico-indicadores" role="img" aria-label="Gráfico de barras: médias de estresse, sono, carga de trabalho e ambiente físico, escala de 1 a 5."></canvas></div>
      </div>

      <div class="painel">
        <h2>Risco por setor</h2>
        <p class="descricao-painel">
          Índice combinado — maior significa mais risco.
        </p>
        <div class="area-grafico"><canvas id="grafico-setores" role="img" aria-label="Gráfico de barras horizontais: índice de risco combinado por setor, do maior para o menor."></canvas></div>
      </div>
    </div>

    <div class="painel">
      <h2>Risco por turno</h2>
      <p class="descricao-painel">
        O mesmo setor pode estar tranquilo de manhã e sobrecarregado à noite.
        Separar por turno revela diferenças que a média do dia esconde.
      </p>
      <div class="area-grafico"><canvas id="grafico-turnos" role="img" aria-label="Gráfico de barras: índice de risco por turno de trabalho — manhã, tarde e noite."></canvas></div>
    </div>

    <div class="painel">
      <h2>O que fazer agora</h2>
      <p class="descricao-painel">
        Recomendações geradas a partir dos indicadores que passaram do limite
        de atenção, organizadas por setor.
      </p>
      ${montarRecomendacoes(recomendacoesPorSetor)}
    </div>

    <div class="painel">
      <h2>O que a equipe está dizendo</h2>
      <p class="descricao-painel">
        Comentários deixados no formulário. A barra colorida indica o nível de
        risco da resposta em que o comentário foi escrito.
      </p>
      ${montarComentarios(comentarios)}
    </div>
  `;

  // As animações só podem começar depois que o HTML está na tela, e só na
  // primeira montagem (ver primeiraMontagem).
  const devoAnimar = primeiraMontagem;
  animarEntrada({ animar: devoAnimar });
  primeiraMontagem = false;

  desenharGraficoEvolucao(evolucao, devoAnimar);
  desenharGraficoIndicadores(geral, devoAnimar);
  desenharGraficoSetores(porSetor, devoAnimar);
  desenharGraficoTurnos(porTurno, devoAnimar);
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
      <h2>Leitura por setor e turno</h2>
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
      linhas.push(`
        <div class="alerta medio">
          <span class="icone">${ICONES_ALERTA.medio}</span>
          <span>${escaparHTML(a.mensagem)}</span>
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
 * Anima um número contando de zero até o valor final.
 *
 * POR QUE ISSO EXISTE: um número que aparece pronto na tela é lido e
 * esquecido. Um número que se forma na frente da pessoa segura o olhar por um
 * instante — tempo suficiente para ela registrar que aquilo é a informação
 * principal da tela.
 *
 * A duração é curta de propósito (900ms). Numa apresentação ao vivo, quem
 * assiste não pode ficar esperando a tela terminar de se montar.
 */
function animarNumero(elemento, valorFinal, { casas = 2, duracao = 900 } = {}) {
  // Quem pediu menos movimento no sistema recebe o valor direto, sem animação.
  const preferSemMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (preferSemMovimento) {
    elemento.textContent = valorFinal.toFixed(casas).replace('.', ',');
    return;
  }

  const inicio = performance.now();

  function passo(agora) {
    const decorrido = Math.min((agora - inicio) / duracao, 1);

    // Desaceleração no fim (ease-out): o número corre rápido no começo e
    // "assenta" no valor final, em vez de parar de repente.
    const progresso = 1 - Math.pow(1 - decorrido, 3);
    const valor = valorFinal * progresso;

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

  // Números marcados com data-animar contam do zero até o valor
  document.querySelectorAll('[data-animar]').forEach((el) => {
    const valor = parseFloat(el.dataset.animar);
    if (Number.isNaN(valor)) return;
    const casas = Number(el.dataset.casas ?? 2);
    animarNumero(el, valor, { casas });
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
          <span data-animar="${indiceRisco}" data-casas="2">0,00</span><span class="de">de 5,0</span>
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
        <div class="rotulo">Respostas no período</div>
        <div class="valor"><span data-animar="${geral.total}" data-casas="0">0</span></div>
        <div class="nota">última ${tempoDesde(geral.ultima_resposta)}</div>
      </div>
      <div class="cartao">
        <div class="rotulo">Setor que mais preocupa</div>
        <div class="valor ${pior ? classeRisco(pior.classificacao.nivel) : ''}"
             style="font-size:1.15rem;font-family:var(--titulo);letter-spacing:-0.01em">
          ${pior ? escaparHTML(pior.setorNome || pior.setor) : '—'}
        </div>
        ${pior ? montarRegua(pior.indiceRisco, pior.classificacao.nivel, { miuda: true, comEscala: false }) : ''}
        <div class="nota">${pior ? `índice ${String(pior.indiceRisco).replace('.', ',')}` : 'sem dados'}</div>
      </div>
      <div class="cartao">
        <div class="rotulo">Setores em risco alto</div>
        <div class="valor ${emAlerta > 0 ? 'risco-alto' : 'risco-baixo'}"><span data-animar="${emAlerta}" data-casas="0">0</span></div>
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
      </div>
    `;
  }).join('');
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

// Configurações visuais repetidas em todos os gráficos
// Mesmas cores declaradas no CSS. O Chart.js desenha em canvas e não enxerga
// as variáveis do CSS, então elas precisam ser repetidas aqui — se mudarem no
// style.css, mudam aqui também.
const CORES = {
  texto: '#0D1B2A',
  textoFraco: '#5E6E7D',
  grade: '#DCE3E9',
  baixo: '#14804A',
  medio: '#8F5A04',
  alto: '#B8342A',
  marca: '#1B3FA0',
  face: '#101F2E',
};

// O Chart.js desenha em canvas e não herda a tipografia do CSS sozinho — sem
// isto, os rótulos e o tooltip saem no sans-serif genérico do navegador,
// destoando do resto da interface, que só usa Public Sans, Archivo e IBM
// Plex Mono. displayColors sai porque todo gráfico daqui tem uma série só:
// o quadrado de cor no tooltip repetiria uma informação que a própria barra
// já mostra.
Chart.defaults.font.family = "'Public Sans', system-ui, -apple-system, sans-serif";
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
        backgroundColor: 'rgba(27, 63, 160, 0.07)',
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
    ['link-usuarios', 'link-acessos'].forEach((id) => {
      const link = document.getElementById(id);
      if (link) link.style.display = '';
    });
  }
}

// Início
ajustarCabecalho();
carregarPainel();
iniciarAtualizacaoAutomatica();

// Atualiza só o texto "há X segundos" a cada 5s, sem tocar no banco
setInterval(atualizarRotuloTempo, 5000);
