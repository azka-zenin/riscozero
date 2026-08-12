// acessos.js
// Tela do histórico de acessos ao painel. Só administradores enxergam.
// Depende de login.js, que fornece Sessao e requisitar().

const conteudo = document.getElementById('conteudo');
const botoesPeriodo = document.querySelectorAll('[data-periodo]');
const botoesApenas = document.querySelectorAll('[data-apenas]');

let periodoAtual = '7';
let apenasAtual = 'todos';

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function escaparHTML(texto) {
  if (texto === null || texto === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

function formatarDataHora(valor) {
  return new Date(valor).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function exigirSessao() {
  if (!Sessao.obterToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function parametros() {
  const p = new URLSearchParams();
  if (periodoAtual !== 'tudo') p.set('periodo', periodoAtual);
  if (apenasAtual !== 'todos') p.set('apenas', apenasAtual);
  return p.toString() ? `?${p.toString()}` : '';
}

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------

async function carregar() {
  if (!exigirSessao()) return;

  conteudo.innerHTML = '<p class="carregando">Carregando histórico</p>';

  try {
    const [respLista, respResumo] = await Promise.all([
      requisitar(`/api/logs${parametros()}`),
      requisitar(`/api/logs/resumo${parametros()}`),
    ]);

    if (respLista.status === 403) {
      conteudo.innerHTML = `
        <div class="vazio">
          <div class="titulo-vazio">Acesso restrito</div>
          <p>Apenas administradores podem ver o histórico de acessos.</p>
          <a href="dashboard.html" class="botao">Voltar ao painel</a>
        </div>`;
      return;
    }

    if (!respLista.ok || !respResumo.ok) throw new Error('Falha ao carregar');

    montar(await respResumo.json(), await respLista.json());
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return;
    console.error(erro);
    conteudo.innerHTML = `
      <div class="vazio">
        <div class="titulo-vazio">Não foi possível carregar</div>
        <p>Verifique se o servidor está rodando e tente novamente.</p>
        <button type="button" class="botao" onclick="carregar()">Tentar de novo</button>
      </div>`;
  }
}

function montar(resumo, registros) {
  const { geral, suspeitos } = resumo;

  if (!geral || geral.total === 0) {
    conteudo.innerHTML = `
      <div class="vazio">
        <div class="titulo-vazio">Nenhum acesso neste período</div>
        <p>Os registros aparecem aqui conforme as pessoas entram no painel.</p>
      </div>`;
    return;
  }

  // Proporção de falhas: muitas falhas em relação ao total é o sinal que
  // interessa. Duas falhas em dez acessos é normal (alguém errou a senha);
  // duas em três já merece atenção.
  const proporcaoFalhas = geral.total > 0 ? geral.falhas / geral.total : 0;
  const classeFalhas = proporcaoFalhas > 0.4 ? 'risco-alto'
    : proporcaoFalhas > 0.2 ? 'risco-medio' : '';

  conteudo.innerHTML = `
    ${montarAlerta(suspeitos)}

    <div class="grade-cartoes">
      <div class="cartao">
        <div class="rotulo">Total de tentativas</div>
        <div class="valor">${geral.total}</div>
      </div>
      <div class="cartao">
        <div class="rotulo">Entradas bem-sucedidas</div>
        <div class="valor risco-baixo">${geral.sucessos}</div>
      </div>
      <div class="cartao">
        <div class="rotulo">Falhas</div>
        <div class="valor ${classeFalhas}">${geral.falhas}</div>
        <div class="nota">${Math.round(proporcaoFalhas * 100)}% do total</div>
      </div>
      <div class="cartao">
        <div class="rotulo">Último registro</div>
        <div class="valor" style="font-size:1.3rem">
          ${geral.ultimo ? formatarDataHora(geral.ultimo) : '—'}
        </div>
      </div>
    </div>

    <div class="painel">
      <h2>Registros</h2>
      <p class="descricao-painel">
        Do mais recente para o mais antigo. Nenhuma senha é guardada, nem as
        digitadas por engano.
      </p>
      ${montarLista(registros)}
    </div>
  `;
}

function montarAlerta(suspeitos) {
  if (!suspeitos || suspeitos.length === 0) return '';

  const itens = suspeitos.map((s) => `
    <div class="alerta alto">
      <span class="icone" aria-hidden="true">▲</span>
      <span>
        <strong>${escaparHTML(s.email)}</strong> acumulou ${s.falhas} tentativas
        que falharam. Última em ${formatarDataHora(s.ultima)}.
      </span>
    </div>`).join('');

  return `<div class="lista-alertas">${itens}</div>`;
}

function montarLista(registros) {
  if (!registros || registros.length === 0) {
    return '<p class="vazio-simples">Nenhum registro com os filtros escolhidos.</p>';
  }

  const linhas = registros.map((r) => `
    <div class="linha-acesso ${r.sucesso ? '' : 'falha'}">
      <span class="marca-acesso" aria-hidden="true">${r.sucesso ? '✓' : '✕'}</span>
      <div class="dados-acesso">
        <div class="identidade">
          ${r.nome ? escaparHTML(r.nome) : '<em>conta desconhecida</em>'}
          <span class="email-acesso">${escaparHTML(r.email)}</span>
        </div>
        <div class="detalhe-acesso">
          ${escaparHTML(r.motivoTexto)}
          ${r.origem ? ` · de ${escaparHTML(r.origem)}` : ''}
        </div>
      </div>
      <div class="quando-acesso">${formatarDataHora(r.data)}</div>
    </div>`).join('');

  return `<div class="lista-acessos">${linhas}</div>`;
}

// ---------------------------------------------------------------------------
// Filtros e cabeçalho
// ---------------------------------------------------------------------------

botoesPeriodo.forEach((b) => {
  b.addEventListener('click', () => {
    periodoAtual = b.dataset.periodo;
    botoesPeriodo.forEach((x) => x.classList.remove('ativo'));
    b.classList.add('ativo');
    carregar();
  });
});

botoesApenas.forEach((b) => {
  b.addEventListener('click', () => {
    apenasAtual = b.dataset.apenas;
    botoesApenas.forEach((x) => x.classList.remove('ativo'));
    b.classList.add('ativo');
    carregar();
  });
});

function ajustarCabecalho() {
  const usuario = Sessao.obterUsuario();
  if (!usuario) return;
  const rotulo = document.getElementById('usuario-logado');
  if (rotulo) {
    const primeiroNome = usuario.nome.split(' ')[0];
    rotulo.textContent = usuario.papel === 'admin' ? `${primeiroNome} (admin)` : primeiroNome;
  }
}

document.getElementById('botao-sair').addEventListener('click', async () => {
  try {
    await requisitar('/api/auth/logout', { method: 'POST' });
  } catch (erro) {
    console.error(erro);
  }
  Sessao.limpar();
  window.location.href = 'login.html';
});

ajustarCabecalho();
carregar();
