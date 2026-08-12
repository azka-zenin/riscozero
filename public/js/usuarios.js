// usuarios.js
// Tela de gerenciamento das contas de acesso (o CRUD pelo navegador).
// Depende de login.js, que fornece Sessao e requisitar().

const listaEl = document.getElementById('lista-usuarios');
const painelForm = document.getElementById('painel-formulario');
const form = document.getElementById('form-usuario');
const tituloForm = document.getElementById('titulo-formulario');
const ajudaSenha = document.getElementById('ajuda-senha');
const campoAtivo = document.getElementById('campo-ativo');
const botaoSalvar = document.getElementById('botao-salvar');
const mensagemForm = document.getElementById('mensagem-formulario');
const mensagemGeral = document.getElementById('mensagem-geral');

let editandoId = null;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** Escapa texto antes de inserir no HTML (nome e e-mail vêm de digitação). */
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

async function carregarUsuarios() {
  if (!exigirSessao()) return;

  listaEl.innerHTML = '<p class="carregando">Carregando contas</p>';

  try {
    const resposta = await requisitar('/api/usuarios');

    if (resposta.status === 403) {
      listaEl.innerHTML = `
        <div class="vazio">
          <div class="titulo-vazio">Acesso restrito</div>
          <p>Apenas administradores podem gerenciar contas de acesso.</p>
          <a href="dashboard.html" class="botao">Voltar ao painel</a>
        </div>`;
      return;
    }

    if (!resposta.ok) throw new Error('Falha ao carregar');

    const usuarios = await resposta.json();
    exibirUsuarios(usuarios);
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

function exibirUsuarios(usuarios) {
  if (!usuarios || usuarios.length === 0) {
    listaEl.innerHTML = '<p class="vazio-simples">Nenhuma conta cadastrada.</p>';
    return;
  }

  const eu = Sessao.obterUsuario();

  const souAdmin = eu && eu.papel === 'admin';

  const linhas = usuarios.map((u) => {
    const souEu = eu && (eu.id === u.id);
    // Dois casos sem botões: a própria conta (ninguém se remove) e quem não é
    // administrador (não tem permissão). As mesmas regras existem no servidor;
    // aqui só evitamos oferecer botões que dariam erro.
    let acoes;
    if (souEu) {
      acoes = '<span class="nota-acao">sua conta</span>';
    } else if (!souAdmin) {
      acoes = '';
    } else {
      acoes = `<button type="button" class="botao secundario" data-editar="${u.id}">Editar</button>
         <button type="button" class="botao secundario perigo" data-remover="${u.id}">Remover</button>`;
    }

    return `
      <div class="linha-usuario ${u.ativo ? '' : 'inativo'}">
        <div class="dados-usuario">
          <div class="nome-usuario">
            ${escaparHTML(u.nome)}
            <span class="selo miudo ${u.papel === 'admin' ? 'sistema' : 'neutro'}">
              ${u.papel === 'admin' ? 'Admin' : 'Gestor'}
            </span>
            ${u.ativo ? '' : '<span class="selo miudo neutro">Desativada</span>'}
          </div>
          <div class="email-usuario">${escaparHTML(u.email)}</div>
          <div class="meta-usuario">Último acesso: ${formatarData(u.ultimoAcesso)}</div>
        </div>
        <div class="acoes-usuario">${acoes}</div>
      </div>`;
  }).join('');

  listaEl.innerHTML = `<div class="painel">${linhas}</div>`;

  listaEl.querySelectorAll('[data-editar]').forEach((b) => {
    b.addEventListener('click', () => abrirEdicao(usuarios.find((u) => u.id === b.dataset.editar)));
  });
  listaEl.querySelectorAll('[data-remover]').forEach((b) => {
    b.addEventListener('click', () => remover(usuarios.find((u) => u.id === b.dataset.remover)));
  });
}

// O botão "Tentar de novo" da tela de erro é recriado a cada falha e antes
// usava onclick="" no HTML, que a política de conteúdo do sistema bloqueia
// (script-src 'self', sem 'unsafe-inline') — o botão de recuperação não fazia
// nada justamente quando era preciso. Ouvir no container resolve.
listaEl.addEventListener('click', (evento) => {
  if (evento.target.closest('[data-recarregar]')) carregarUsuarios();
});

// ---------------------------------------------------------------------------
// Criar e editar
// ---------------------------------------------------------------------------

function abrirCriacao() {
  editandoId = null;
  form.reset();
  document.getElementById('usuario-id').value = '';
  tituloForm.textContent = 'Nova conta';
  ajudaSenha.textContent = 'Mínimo de 6 caracteres.';
  botaoSalvar.textContent = 'Criar conta';
  campoAtivo.style.display = 'none';
  painelForm.style.display = '';
  mensagemForm.className = 'mensagem';
  document.getElementById('nome').focus();
}

function abrirEdicao(usuario) {
  if (!usuario) return;
  editandoId = usuario.id;
  document.getElementById('usuario-id').value = usuario.id;
  document.getElementById('nome').value = usuario.nome;
  document.getElementById('email').value = usuario.email;
  document.getElementById('senha').value = '';
  document.getElementById('papel').value = usuario.papel;
  document.getElementById('ativo').value = String(usuario.ativo);

  tituloForm.textContent = `Editando ${usuario.nome}`;
  // Deixa claro que o campo em branco mantém a senha atual — sem esse aviso,
  // é natural achar que salvar com o campo vazio apagaria a senha.
  ajudaSenha.textContent = 'Deixe em branco para manter a senha atual.';
  botaoSalvar.textContent = 'Salvar alterações';
  campoAtivo.style.display = '';
  painelForm.style.display = '';
  mensagemForm.className = 'mensagem';
  painelForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fecharFormulario() {
  painelForm.style.display = 'none';
  form.reset();
  editandoId = null;
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const nome = document.getElementById('nome').value.trim();
  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;
  const papel = document.getElementById('papel').value;
  const ativo = document.getElementById('ativo').value === 'true';

  if (!nome) return avisar(mensagemForm, 'erro', 'Informe o nome.');
  if (!email) return avisar(mensagemForm, 'erro', 'Informe o e-mail.');
  if (!editandoId && !senha) return avisar(mensagemForm, 'erro', 'Defina uma senha para a nova conta.');
  if (senha && senha.length < 6) return avisar(mensagemForm, 'erro', 'A senha precisa ter pelo menos 6 caracteres.');

  const corpo = { nome, email, papel };
  if (senha) corpo.senha = senha;
  if (editandoId) corpo.ativo = ativo;

  botaoSalvar.disabled = true;
  const textoOriginal = botaoSalvar.textContent;
  botaoSalvar.textContent = 'Salvando...';

  try {
    const resposta = await requisitar(
      editandoId ? `/api/usuarios/${editandoId}` : '/api/usuarios',
      { method: editandoId ? 'PUT' : 'POST', body: JSON.stringify(corpo) }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      avisar(mensagemForm, 'erro', dados.erro || 'Não foi possível salvar.');
      return;
    }

    fecharFormulario();
    avisar(mensagemGeral, 'sucesso', dados.mensagem);
    carregarUsuarios();
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return;
    console.error(erro);
    avisar(mensagemForm, 'erro', 'Sem conexão com o servidor.');
  } finally {
    botaoSalvar.disabled = false;
    botaoSalvar.textContent = textoOriginal;
  }
});

// ---------------------------------------------------------------------------
// Remover
// ---------------------------------------------------------------------------

async function remover(usuario) {
  if (!usuario) return;

  // Remoção é irreversível, então pedimos confirmação nomeando a pessoa —
  // evita apagar a conta errada por clique no botão vizinho.
  const confirmado = window.confirm(
    `Remover a conta de ${usuario.nome} (${usuario.email})?\n\n` +
    'Esta ação não pode ser desfeita. Para apenas suspender o acesso, ' +
    'use Editar e mude a situação para "Desativada".'
  );
  if (!confirmado) return;

  try {
    const resposta = await requisitar(`/api/usuarios/${usuario.id}`, { method: 'DELETE' });
    const dados = await resposta.json();

    if (!resposta.ok) {
      avisar(mensagemGeral, 'erro', dados.erro || 'Não foi possível remover.');
      return;
    }

    avisar(mensagemGeral, 'sucesso', dados.mensagem);
    carregarUsuarios();
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return;
    console.error(erro);
    avisar(mensagemGeral, 'erro', 'Sem conexão com o servidor.');
  }
}

// ---------------------------------------------------------------------------
// Cabeçalho e eventos gerais
// ---------------------------------------------------------------------------

function ajustarCabecalho() {
  const usuario = Sessao.obterUsuario();
  if (!usuario) return;

  const rotulo = document.getElementById('usuario-logado');
  if (rotulo) {
    const primeiroNome = usuario.nome.split(' ')[0];
    rotulo.textContent = usuario.papel === 'admin' ? `${primeiroNome} (admin)` : primeiroNome;
  }

  // Um gestor pode ver a lista de contas, mas não criar nem editar. Escondemos
  // os botões que dariam erro de permissão — o servidor bloqueia de qualquer
  // forma, mas oferecer um botão que sempre falha é confuso.
  // "Trocar minha senha" continua visível: é sobre a própria conta.
  if (usuario.papel !== 'admin') {
    const botaoNova = document.getElementById('botao-nova-conta');
    if (botaoNova) botaoNova.style.display = 'none';
  }
}

document.getElementById('botao-nova-conta').addEventListener('click', abrirCriacao);
document.getElementById('botao-cancelar').addEventListener('click', fecharFormulario);

form.addEventListener('input', () => {
  mensagemForm.textContent = '';
  mensagemForm.className = 'mensagem';
});

document.getElementById('botao-sair').addEventListener('click', async () => {
  try {
    await requisitar('/api/auth/logout', { method: 'POST' });
  } catch (erro) {
    console.error(erro);
  }
  Sessao.limpar();
  window.location.href = 'login.html';
});

// ---------------------------------------------------------------------------
// Trocar a própria senha
// ---------------------------------------------------------------------------

const painelMinhaSenha = document.getElementById('painel-minha-senha');
const formMinhaSenha = document.getElementById('form-minha-senha');
const mensagemMinhaSenha = document.getElementById('mensagem-minha-senha');
const botaoSalvarSenha = document.getElementById('botao-salvar-senha');

document.getElementById('botao-minha-senha').addEventListener('click', () => {
  fecharFormulario(); // evita os dois formulários abertos ao mesmo tempo
  formMinhaSenha.reset();
  mensagemMinhaSenha.className = 'mensagem';
  painelMinhaSenha.style.display = '';
  document.getElementById('senha-atual').focus();
});

document.getElementById('botao-cancelar-senha').addEventListener('click', () => {
  painelMinhaSenha.style.display = 'none';
  formMinhaSenha.reset();
});

formMinhaSenha.addEventListener('input', () => {
  mensagemMinhaSenha.textContent = '';
  mensagemMinhaSenha.className = 'mensagem';
});

formMinhaSenha.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const atual = document.getElementById('senha-atual').value;
  const nova = document.getElementById('senha-nova').value;
  const confirma = document.getElementById('senha-confirma').value;

  if (!atual) return avisar(mensagemMinhaSenha, 'erro', 'Informe a senha atual.');
  if (!nova) return avisar(mensagemMinhaSenha, 'erro', 'Informe a nova senha.');
  if (nova.length < 6) {
    return avisar(mensagemMinhaSenha, 'erro', 'A nova senha precisa ter pelo menos 6 caracteres.');
  }
  // Conferir a digitação aqui evita a pessoa trocar por uma senha com erro de
  // digitação e ficar sem conseguir entrar depois.
  if (nova !== confirma) {
    return avisar(mensagemMinhaSenha, 'erro', 'As duas senhas novas não são iguais.');
  }

  botaoSalvarSenha.disabled = true;
  botaoSalvarSenha.textContent = 'Trocando...';

  try {
    const resposta = await requisitar('/api/auth/trocar-senha', {
      method: 'POST',
      body: JSON.stringify({ senhaAtual: atual, senhaNova: nova }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      avisar(mensagemMinhaSenha, 'erro', dados.erro || 'Não foi possível trocar a senha.');
      return;
    }

    painelMinhaSenha.style.display = 'none';
    formMinhaSenha.reset();
    avisar(mensagemGeral, 'sucesso', dados.mensagem);
  } catch (erro) {
    if (erro.message === 'Sessão expirada') return;
    console.error(erro);
    avisar(mensagemMinhaSenha, 'erro', 'Sem conexão com o servidor.');
  } finally {
    botaoSalvarSenha.disabled = false;
    botaoSalvarSenha.textContent = 'Trocar senha';
  }
});

ajustarCabecalho();
carregarUsuarios();
