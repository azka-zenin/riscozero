// formulario.js
// Envia a resposta do formulário para a API e mostra a tela de confirmação.

const form = document.getElementById('form-risco');
const mensagem = document.getElementById('mensagem');
const areaFormulario = document.getElementById('area-formulario');
const areaSucesso = document.getElementById('area-sucesso');
const botaoNova = document.getElementById('botao-nova');
const botaoEnviar = form.querySelector('button[type="submit"]');
const progressoPreenchido = document.getElementById('progresso-preenchido');
const progressoTexto = document.getElementById('progresso-texto');

// As 4 escalas são "as perguntas" de verdade da autoavaliação — Setor e
// Turno são contexto rápido, não entram na contagem (mesma distinção já
// feita no espaçamento do formulário, ver style.css).
const CAMPOS_ESCALA = ['estresse', 'sono', 'carga_trabalho', 'ambiente_fisico'];

/** Atualiza a barra "X de 4 perguntas respondidas" conforme a pessoa preenche. */
function atualizarProgresso() {
  if (!progressoPreenchido || !progressoTexto) return;

  const respondidas = CAMPOS_ESCALA.filter(
    (campo) => form.querySelector(`input[name="${campo}"]:checked`)
  ).length;

  progressoPreenchido.style.width = `${(respondidas / CAMPOS_ESCALA.length) * 100}%`;
  progressoTexto.textContent = `${respondidas} de ${CAMPOS_ESCALA.length} perguntas respondidas`;
}

// Ordem visual dos campos obrigatórios — usada só pelo "Enter esperto"
// abaixo, para saber pra onde levar o foco. As mensagens de erro do envio
// (mais adiante) continuam com sua própria lógica, que já lista TODAS as
// perguntas em branco de uma vez — mais útil ali do que "a primeira só".
const ORDEM_CAMPOS = ['setor', 'turno', ...CAMPOS_ESCALA];

function elementoDoCampo(campo) {
  return campo === 'setor' || campo === 'turno'
    ? document.getElementById(campo)
    : form.querySelector(`input[name="${campo}"]`);
}

function primeiroCampoEmBranco() {
  for (const campo of ORDEM_CAMPOS) {
    const preenchido = campo === 'setor' || campo === 'turno'
      ? !!form.querySelector(`#${campo}`).value
      : !!form.querySelector(`input[name="${campo}"]:checked`);
    if (!preenchido) return elementoDoCampo(campo);
  }
  return null; // tudo respondido
}

// Comportamento padrão do HTML: Enter em qualquer campo do formulário
// (menos textarea) tenta submeter — inclusive no meio de um grupo de escala
// ainda sem resposta. Isso já era barrado pela validação do envio (abaixo),
// mas com uma mensagem de erro a cada tecla, quando o gesto natural seria só
// avançar. Aqui o Enter fica esperto: leva pro primeiro campo em branco
// (sem erro) se faltar algo, ou deixa o envio de verdade acontecer se está
// tudo respondido — mesma ideia usada no login (ver public/js/login.js).
form.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Enter') return;
  if (evento.target === botaoEnviar || evento.target.tagName === 'TEXTAREA') return;

  const proximo = primeiroCampoEmBranco();
  if (!proximo) return; // tudo respondido: deixa o Enter enviar de verdade

  evento.preventDefault();
  proximo.focus();
  const campo = proximo.closest('.campo');
  if (campo) campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

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
  } catch (erro) {
    console.error(erro);
    mostrarMensagem('erro', 'Sem conexão com o servidor. Verifique se ele está rodando.');
  } finally {
    botaoEnviar.disabled = false;
    botaoEnviar.textContent = 'Enviar resposta';
  }
});

botaoNova.addEventListener('click', () => {
  form.reset();
  limparMensagem();
  atualizarProgresso();
  areaSucesso.style.display = 'none';
  areaFormulario.style.display = 'block';
});

// Assim que a pessoa mexe em qualquer campo, o aviso de erro sai da tela.
// Deixar a mensagem antiga visível depois de corrigido faz parecer que o
// problema continua — e ela reaparece no envio seguinte se ainda faltar algo.
form.addEventListener('change', limparMensagem);
form.addEventListener('input', limparMensagem);
form.addEventListener('change', atualizarProgresso);

function mostrarMensagem(tipo, texto) {
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${tipo}`;
}

function limparMensagem() {
  mensagem.textContent = '';
  mensagem.className = 'mensagem';
}
