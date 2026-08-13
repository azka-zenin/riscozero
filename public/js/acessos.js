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

// Mesmo ícone (e mesma razão) do ICONES_ALERTA.alto em dashboard.js: um
// caractere ▲ muda de peso visual conforme a fonte do sistema operacional,
// e este alerta tem o mesmo significado — situação que pede atenção —, então
// usa o mesmo traço. currentColor herda a cor de .alerta.alto (vermelho).
const ICONE_ALERTA = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 1.5 15 14H1L8 1.5Zm0 4.2a.85.85 0 0 0-.85.85v3.4a.85.85 0 0 0 1.7 0v-3.4A.85.85 0 0 0 8 5.7Zm0 6.3a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9Z"/></svg>';

// Mesmo traço (2px, ponta arredondada) do ICONES_ALERTA.ok em dashboard.js —
// os caracteres ✓/✕ que estavam aqui antes mudam de peso e proporção
// conforme a fonte do sistema (finos no macOS, quadrados e pesados em
// alguns navegadores no Windows), o que destoa do resto do sistema, todo
// desenhado à mão em SVG por esse motivo.
const ICONE_SUCESSO = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5 6.3 12 13 4"/></svg>';
const ICONE_FALHA = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 4l8 8M12 4l-8 8"/></svg>';

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
        <button type="button" class="botao" data-recarregar>Tentar de novo</button>
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
        <div class="valor valor-longo">
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
      <span class="icone" aria-hidden="true">${ICONE_ALERTA}</span>
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
      <span class="marca-acesso" aria-hidden="true">${r.sucesso ? ICONE_SUCESSO : ICONE_FALHA}</span>
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

// O botão "Tentar de novo" da tela de erro é recriado a cada falha e antes
// usava onclick="" no HTML, que a política de conteúdo do sistema bloqueia
// (script-src 'self', sem 'unsafe-inline') — o botão de recuperação não fazia
// nada justamente quando era preciso. Ouvir no container resolve.
conteudo.addEventListener('click', (evento) => {
  if (evento.target.closest('[data-recarregar]')) carregar();
});

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

  // Mesma lógica de dashboard.js: "Acessos" exige admin no servidor. Sem
  // isto, um gestor que chegasse aqui por link direto (não pela nav do
  // painel) veria as opções como links normais e só descobriria a restrição
  // depois de clicar.
  if (usuario.papel === 'admin') {
    ['link-usuarios', 'link-acessos'].forEach((id) => {
      const link = document.getElementById(id);
      if (link) link.style.display = '';
    });
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
