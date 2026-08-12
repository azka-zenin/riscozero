// login.js
// Entrada no painel de gestão e utilitários de sessão usados também pelo
// dashboard e pela tela de usuários.
//
// O token fica no sessionStorage (não no localStorage) de propósito:
// sessionStorage é apagado quando a aba fecha, o que é mais adequado a um
// painel com dados sensíveis em um computador compartilhado — como um PC de
// laboratório ou de chão de fábrica.

const CHAVE_TOKEN = 'riscozero_token';
const CHAVE_USUARIO = 'riscozero_usuario';

const Sessao = {
  salvar(token, usuario) {
    sessionStorage.setItem(CHAVE_TOKEN, token);
    if (usuario) sessionStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  },
  obterToken() {
    return sessionStorage.getItem(CHAVE_TOKEN);
  },
  obterUsuario() {
    const bruto = sessionStorage.getItem(CHAVE_USUARIO);
    try {
      return bruto ? JSON.parse(bruto) : null;
    } catch {
      return null;
    }
  },
  ehAdmin() {
    const u = this.obterUsuario();
    return !!u && u.papel === 'admin';
  },
  limpar() {
    sessionStorage.removeItem(CHAVE_TOKEN);
    sessionStorage.removeItem(CHAVE_USUARIO);
  },
  cabecalho() {
    const token = this.obterToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

/**
 * Requisição autenticada com tratamento central de sessão expirada.
 * Compartilhada por dashboard.js e usuarios.js para que o comportamento ao
 * perder a sessão seja o mesmo em todas as telas.
 */
async function requisitar(url, opcoes = {}) {
  const resposta = await fetch(url, {
    ...opcoes,
    headers: {
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
      ...Sessao.cabecalho(),
      ...(opcoes.headers || {}),
    },
  });

  if (resposta.status === 401) {
    Sessao.limpar();
    window.location.href = 'login.html';
    throw new Error('Sessão expirada');
  }

  return resposta;
}

// A partir daqui, só roda na página de login
const formLogin = document.getElementById('form-login');

if (formLogin) {
  const mensagem = document.getElementById('mensagem');
  const campoEmail = document.getElementById('email');
  const campoSenha = document.getElementById('senha');
  const botao = formLogin.querySelector('button[type="submit"]');

  formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const email = campoEmail.value.trim();
    const senha = campoSenha.value;

    if (!email) {
      mostrar('erro', 'Informe o seu e-mail.');
      campoEmail.focus();
      return;
    }
    if (!senha) {
      mostrar('erro', 'Informe a sua senha.');
      campoSenha.focus();
      return;
    }

    botao.disabled = true;
    botao.textContent = 'Entrando...';

    try {
      const resposta = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        mostrar('erro', dados.erro || 'Não foi possível entrar.');
        campoSenha.value = '';
        campoSenha.focus();
        return;
      }

      Sessao.salvar(dados.token, dados.usuario);
      window.location.href = 'dashboard.html';
    } catch (erro) {
      console.error(erro);
      mostrar('erro', 'Sem conexão com o servidor. Verifique se ele está rodando.');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });

  // O aviso some assim que a pessoa começa a corrigir os campos
  formLogin.addEventListener('input', () => {
    mensagem.textContent = '';
    mensagem.className = 'mensagem';
  });

  function mostrar(tipo, texto) {
    mensagem.textContent = texto;
    mensagem.className = `mensagem ${tipo}`;
  }
}
