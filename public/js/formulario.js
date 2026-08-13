// formulario.js
// Envia a resposta do formulário para a API e mostra a tela de confirmação.

const form = document.getElementById('form-risco');
const mensagem = document.getElementById('mensagem');
const areaFormulario = document.getElementById('area-formulario');
const areaSucesso = document.getElementById('area-sucesso');
const botaoNova = document.getElementById('botao-nova');
const botaoEnviar = form.querySelector('button[type="submit"]');

// ---------------------------------------------------------------------------
// Modo quiosque (?quiosque=1): pensado pra um tablet fixo no chão de
// fábrica, sempre com o formulário aberto, sem ninguém precisando tocar em
// "Enviar outra resposta" entre uma pessoa e a próxima.
//
// O QUE MUDA: depois de confirmar o envio, volta sozinho ao formulário em
// vez de esperar um toque; e o link "Painel de gestão" some, pra ninguém
// tocar nele por engano num aparelho de chão de fábrica.
// ---------------------------------------------------------------------------
const MODO_QUIOSQUE = new URLSearchParams(window.location.search).get('quiosque') === '1';
const SEGUNDOS_ATE_VOLTAR = 8;
let temporizadorVolta = null;

if (MODO_QUIOSQUE) {
  const linkPainel = document.getElementById('link-painel-gestao');
  if (linkPainel) linkPainel.style.display = 'none';

  const aviso = document.getElementById('aviso-quiosque');
  if (aviso) aviso.style.display = 'block';
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const dados = new FormData(form);
  const corpo = {
    setor: dados.get('setor'),
    turno: dados.get('turno'),
    estresse: dados.get('estresse'),
    sono: dados.get('sono'),
    carga_trabalho: dados.get('carga_trabalho'),
    ambiente_fisico: dados.get('ambiente_fisico'),
    comentario: dados.get('comentario'),
  };

  // Validação no navegador: evita uma ida ao servidor que já sabemos que falharia.
  // O servidor valida de novo por segurança — nunca confiamos só no front.
  if (!corpo.setor) {
    mostrarMensagem('erro', 'Selecione o seu setor antes de enviar.');
    document.getElementById('setor').focus();
    return;
  }

  if (!corpo.turno) {
    mostrarMensagem('erro', 'Selecione o seu turno antes de enviar.');
    document.getElementById('turno').focus();
    return;
  }

  // Nomes usados na mensagem de erro. Dizer QUAL pergunta faltou é bem mais
  // útil do que só informar quantas ficaram em branco.
  const NOMES = {
    estresse: 'Nível de estresse',
    sono: 'Qualidade do sono',
    carga_trabalho: 'Carga de trabalho',
    ambiente_fisico: 'Conforto do ambiente físico',
  };

  const faltando = Object.keys(NOMES).filter((campo) => !corpo[campo]);
  if (faltando.length > 0) {
    const nomes = faltando.map((c) => NOMES[c]);
    const lista = nomes.length === 1
      ? nomes[0]
      : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
    mostrarMensagem('erro', `Falta responder: ${lista}.`);

    // Leva a pessoa até a primeira pergunta em branco
    const primeiro = document.querySelector(`input[name="${faltando[0]}"]`);
    if (primeiro) {
      primeiro.closest('.campo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  botaoEnviar.disabled = true;
  botaoEnviar.textContent = 'Enviando...';

  try {
    const resposta = await fetch('/api/respostas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok) {
      const erro = await resposta.json();
      mostrarMensagem('erro', erro.erro || 'Não foi possível enviar. Tente novamente.');
      return;
    }

    // Troca o formulário pela tela de confirmação
    areaFormulario.style.display = 'none';
    areaSucesso.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (MODO_QUIOSQUE) {
      clearTimeout(temporizadorVolta);
      temporizadorVolta = setTimeout(() => botaoNova.click(), SEGUNDOS_ATE_VOLTAR * 1000);
    }
  } catch (erro) {
    console.error(erro);
    mostrarMensagem('erro', 'Sem conexão com o servidor. Verifique se ele está rodando.');
  } finally {
    botaoEnviar.disabled = false;
    botaoEnviar.textContent = 'Enviar resposta';
  }
});

botaoNova.addEventListener('click', () => {
  clearTimeout(temporizadorVolta);
  form.reset();
  limparMensagem();
  areaSucesso.style.display = 'none';
  areaFormulario.style.display = 'block';
});

// Assim que a pessoa mexe em qualquer campo, o aviso de erro sai da tela.
// Deixar a mensagem antiga visível depois de corrigido faz parecer que o
// problema continua — e ela reaparece no envio seguinte se ainda faltar algo.
form.addEventListener('change', limparMensagem);
form.addEventListener('input', limparMensagem);

function mostrarMensagem(tipo, texto) {
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${tipo}`;
}

function limparMensagem() {
  mensagem.textContent = '';
  mensagem.className = 'mensagem';
}
