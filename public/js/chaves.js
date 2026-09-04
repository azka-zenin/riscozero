// chaves.js
// Tela das chaves de leitura usadas por ferramentas de análise (Power BI e
// afins). Depende de login.js, que fornece Sessao e requisitar().
//
// A regra que molda esta tela inteira: o valor da chave existe em um único
// instante — na resposta da criação. Depois disso o servidor só tem o hash.
// Por isso o painel de "guarde esta chave" é grande, tem botão de copiar e
// exige uma confirmação para sumir: não há segunda chance.

const listaEl = document.getElementById('lista-chaves');
const painelForm = document.getElementById('painel-formulario');
const painelChaveNova = document.getElementById('painel-chave-nova');
const valorChaveNova = document.getElementById('valor-chave-nova');
const form = document.getElementById('form-chave');
const mensagemForm = document.getElementById('mensagem-formulario');
const mensagemGeral = document.getElementById('mensagem-geral');

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function escaparHTML(texto) {
  if (texto === null || texto === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

function formatarData(valor) {
  if (!valor) return 'nunca';
  return new Date(valor).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** "em 12 dias" / "há 3 dias" — mais legível que a data crua num prazo. */
function emDias(valor) {
  const dias = Math.ceil((new Date(valor) - Date.now()) / 86400000);
  if (dias < 0) return `há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'hoje';
  return `em ${dias} dia${dias === 1 ? '' : 's'}`;
}

function avisar(elemento, tipo, texto) {
  elemento.textContent = texto;
  elemento.className = `mensagem ${tipo}`;
  if (tipo === 'sucesso') {
    setTimeout(() => {
      elemento.textContent = '';
      elemento.className = 'mensagem';
    }, 4000);
  }
}

function exigirSessao() {
  if (!Sessao.obterToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

async function carregarChaves() {
  if (!exigirSessao()) return;

  listaEl.innerHTML = '<p class="carregando">Carregando chaves</p>';

  try {
    const resposta = await requisitar('/api/bi/chaves');

    if (resposta.status === 403) {
      listaEl.innerHTML = `
        <div class="vazio">
          <div class="titulo-vazio">Acesso restrito</div>
          <p>Apenas administradores podem gerenciar chaves de análise.</p>
          <a href="dashboard.html" class="botao">Voltar ao painel</a>
        </div>`;
      document.querySelector('.controles').style.display = 'none';
      return;
    }

    if (!resposta.ok) throw new Error('Falha ao carregar');

    exibirChaves(await resposta.json());
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return;
    console.error(erro);
    listaEl.innerHTML = `
      <div class="vazio">
        <div class="titulo-vazio">Não foi possível carregar</div>
        <p>Verifique se o servidor está rodando e tente novamente.</p>
        <button type="button" class="botao" data-recarregar>Tentar de novo</button>
      </div>`;
  }
}

function exibirChaves(chaves) {
  if (!chaves || chaves.length === 0) {
    listaEl.innerHTML = `
      <div class="vazio">
        <div class="titulo-vazio">Nenhuma chave criada</div>
        <p>
          Crie uma chave para conectar o Power BI, o Looker ou uma planilha aos
          dados do sistema, com atualização automática.
        </p>
      </div>`;
    return;
  }

  // Mesma convenção da tela de contas: "sistema" é o estado pleno (lá é
  // Admin, aqui é Ativa) e "neutro" é o estado apagado. O verde/âmbar/vermelho
  // do resto do sistema é reservado a valores de risco e não entra aqui.
  const selos = {
    ativa: '<span class="selo miudo sistema">Ativa</span>',
    expirada: '<span class="selo miudo neutro">Expirada</span>',
    revogada: '<span class="selo miudo neutro">Revogada</span>',
  };

  const linhas = chaves.map((c) => {
    // Chave revogada ou vencida já não funciona: oferecer "Revogar" nela seria
    // um botão que não muda nada. Fica só o registro, para a auditoria.
    const acoes = c.situacao === 'ativa'
      ? `<button type="button" class="botao secundario perigo" data-revogar="${c.id}">Revogar</button>`
      : '<span class="nota-acao">sem efeito</span>';

    const prazo = c.situacao === 'ativa'
      ? `Expira ${emDias(c.expiraEm)}`
      : `Expirava em ${formatarData(c.expiraEm)}`;

    return `
      <div class="linha-usuario ${c.situacao === 'ativa' ? '' : 'inativo'}">
        <div class="dados-usuario">
          <div class="nome-usuario">
            ${escaparHTML(c.nome)}
            ${selos[c.situacao] || ''}
          </div>
          <div class="email-usuario"><code>${escaparHTML(c.prefixo)}…</code></div>
          <div class="meta-usuario">
            ${prazo} · Último uso: ${formatarData(c.ultimoUso)} ·
            Criada por ${escaparHTML(c.criadoPor)}
          </div>
        </div>
        <div class="acoes-usuario">${acoes}</div>
      </div>`;
  }).join('');

  listaEl.innerHTML = `<div class="painel">${linhas}</div>`;

  listaEl.querySelectorAll('[data-revogar]').forEach((b) => {
    b.addEventListener('click', () => revogar(chaves.find((c) => c.id === b.dataset.revogar), b));
  });
}

// Mesma razão da tela de contas: o botão "Tentar de novo" é recriado a cada
// falha, e onclick no HTML seria bloqueado pela política de conteúdo.
listaEl.addEventListener('click', (evento) => {
  if (evento.target.closest('[data-recarregar]')) carregarChaves();
});

// ---------------------------------------------------------------------------
// Criar
// ---------------------------------------------------------------------------

function abrirCriacao() {
  form.reset();
  painelChaveNova.style.display = 'none';
  painelForm.style.display = '';
  mensagemForm.className = 'mensagem';
  document.getElementById('nome-chave').focus();
}

function fecharCriacao() {
  painelForm.style.display = 'none';
  mensagemForm.textContent = '';
  mensagemForm.className = 'mensagem';
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!exigirSessao()) return;

  const nome = document.getElementById('nome-chave').value.trim();
  if (!nome) {
    avisar(mensagemForm, 'erro', 'Dê um nome à chave, para saber depois de quem ela é.');
    document.getElementById('nome-chave').focus();
    return;
  }

  const botao = document.getElementById('botao-salvar');
  botao.disabled = true;

  try {
    const resposta = await requisitar('/api/bi/chaves', {
      method: 'POST',
      body: JSON.stringify({ nome, dias: Number(document.getElementById('dias-chave').value) }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      avisar(mensagemForm, 'erro', dados.erro || 'Não foi possível criar a chave.');
      return;
    }

    fecharCriacao();
    mostrarChaveNova(dados.chave);
    carregarChaves();
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return;
    console.error(erro);
    avisar(mensagemForm, 'erro', 'Erro de conexão. Tente novamente.');
  } finally {
    botao.disabled = false;
  }
});

function mostrarChaveNova(chave) {
  valorChaveNova.textContent = chave;
  painelChaveNova.style.display = '';
  painelChaveNova.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('botao-copiar').focus();
}

document.getElementById('botao-copiar').addEventListener('click', async () => {
  const botao = document.getElementById('botao-copiar');
  try {
    await navigator.clipboard.writeText(valorChaveNova.textContent);
    botao.textContent = 'Copiado';
    setTimeout(() => { botao.textContent = 'Copiar'; }, 2000);
  } catch {
    // navigator.clipboard não existe fora de HTTPS (ou localhost). Em vez de
    // falhar em silêncio, seleciona o texto para quem copiar com Ctrl+C.
    const faixa = document.createRange();
    faixa.selectNodeContents(valorChaveNova);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(faixa);
    botao.textContent = 'Copie com Ctrl+C';
    setTimeout(() => { botao.textContent = 'Copiar'; }, 3000);
  }
});

document.getElementById('botao-guardei').addEventListener('click', () => {
  // Apagar o valor da tela é o ponto: deixá-lo visível num painel aberto num
  // computador compartilhado desfaria o cuidado de nunca guardá-lo no banco.
  valorChaveNova.textContent = '';
  painelChaveNova.style.display = 'none';
  document.getElementById('botao-nova-chave').focus();
});

// ---------------------------------------------------------------------------
// Revogar
// ---------------------------------------------------------------------------

const fundoConfirmacao = document.getElementById('fundo-confirmacao');
const textoConfirmacao = document.getElementById('texto-confirmacao');
const botaoCancelarRemocao = document.getElementById('botao-cancelar-remocao');
const botaoConfirmarRemocao = document.getElementById('botao-confirmar-remocao');

let resolverConfirmacao = null;
let elementoParaRefoco = null;

function confirmarRevogacao(chave, botaoQueAbriu) {
  textoConfirmacao.textContent =
    `Revogar a chave "${chave.nome}"? Os relatórios que a usam param de `
    + 'atualizar imediatamente. Não é possível reativá-la — seria preciso criar '
    + 'uma nova chave e trocá-la em cada relatório.';
  elementoParaRefoco = botaoQueAbriu || null;
  fundoConfirmacao.style.display = 'flex';
  botaoCancelarRemocao.focus();
  return new Promise((resolve) => { resolverConfirmacao = resolve; });
}

function fecharConfirmacao(resultado) {
  fundoConfirmacao.style.display = 'none';
  if (resolverConfirmacao) {
    resolverConfirmacao(resultado);
    resolverConfirmacao = null;
  }
  if (elementoParaRefoco) {
    elementoParaRefoco.focus();
    elementoParaRefoco = null;
  }
}

botaoCancelarRemocao.addEventListener('click', () => fecharConfirmacao(false));
botaoConfirmarRemocao.addEventListener('click', () => fecharConfirmacao(true));

fundoConfirmacao.addEventListener('click', (evento) => {
  if (evento.target === fundoConfirmacao) fecharConfirmacao(false);
});

document.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Escape') return;
  if (fundoConfirmacao.style.display !== 'none') {
    fecharConfirmacao(false);
    return;
  }
  if (painelForm.style.display !== 'none') fecharCriacao();
});

async function revogar(chave, botaoQueAbriu) {
  if (!chave || !exigirSessao()) return;

  const confirmado = await confirmarRevogacao(chave, botaoQueAbriu);
  if (!confirmado) return;

  try {
    const resposta = await requisitar(`/api/bi/chaves/${chave.id}`, { method: 'DELETE' });
    const dados = await resposta.json();

    if (!resposta.ok) {
      avisar(mensagemGeral, 'erro', dados.erro || 'Não foi possível revogar a chave.');
      return;
    }

    avisar(mensagemGeral, 'sucesso', dados.mensagem);
    carregarChaves();
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return;
    console.error(erro);
    avisar(mensagemGeral, 'erro', 'Erro de conexão. Tente novamente.');
  }
}

// ---------------------------------------------------------------------------

document.getElementById('botao-nova-chave').addEventListener('click', abrirCriacao);
document.getElementById('botao-cancelar').addEventListener('click', fecharCriacao);

// O guia fica num .md do repositório, que o navegador baixaria em vez de
// exibir. Em vez de um link quebrado, mostramos o caminho do arquivo.
document.getElementById('link-guia').addEventListener('click', (evento) => {
  evento.preventDefault();
  avisar(mensagemGeral, 'info', 'O passo a passo de conexão está em docs/POWER-BI.md, na pasta do projeto.');
});

carregarChaves();
