// transicoes.js
// Transição suave (fade) entre páginas do sistema.
//
// O RiscoZero não é uma SPA — cada tela é um .html separado, navegado por
// <a href> normal. Sem isso, trocar de página é um corte seco: a tela pisca
// em branco por um instante. Aqui a saída (fade-out) é feita à mão em JS,
// interceptando o clique; a entrada (fade-in) já existe via @keyframes
// "surgir" no CSS, então não duplicamos essa parte.
//
// Único arquivo incluído em TODAS as páginas (index, login, dashboard,
// usuarios, acessos) — por isso fica separado de login.js, que é só sobre
// sessão e não roda no formulário público.

(function () {
  const DURACAO_MS = 140; // metade do tempo do fade-in (surgir, 0.4s):
                           // saída rápida, sem fazer esperar por nada.

  const prefereMenosMovimento =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefereMenosMovimento) return; // navegação já é instantânea sem JS extra

  document.documentElement.classList.add('js-transicoes');

  // Rede de segurança: "saindo" só pode existir no instante entre o clique e a
  // troca de página. Se a página voltar a ser exibida ainda com a classe —
  // caso clássico: o usuário aperta "voltar" e o navegador restaura a página
  // do cache de histórico (bfcache) exatamente como estava, com a classe
  // incluída —, o <main> reapareceria invisível (opacity: 0) sem nada para
  // removê-la. pageshow cobre tanto a carga normal quanto essa restauração.
  window.addEventListener('pageshow', () => {
    document.documentElement.classList.remove('saindo');
  });

  document.addEventListener('click', (evento) => {
    const link = evento.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Só intercepta navegação normal, dentro do próprio site, sem modificador
    // de teclado (abrir em nova aba, etc.) — tudo isso continua funcionando
    // exatamente como o navegador já faz por padrão.
    const mesmaAba = link.target === '' || link.target === '_self';
    const semModificador =
      !evento.metaKey && !evento.ctrlKey && !evento.shiftKey && !evento.altKey;
    const arquivoLocal = /\.html?($|\?|#)/.test(href) || !href.includes(':');

    if (!mesmaAba || !semModificador || evento.button !== 0 || !arquivoLocal) return;

    let destino;
    try {
      destino = new URL(link.href, location.href);
    } catch {
      return; // endereço que o navegador não resolve: não é da nossa conta
    }

    // Âncora dentro da própria página (#secao-setores, o "pular para o
    // conteúdo"...): NÃO é troca de página, e tratá-la como se fosse apaga a
    // tela para sempre. O fade-out entra, mas atribuir um endereço que difere
    // do atual só no fragmento é navegação "no mesmo documento": o navegador
    // rola até a âncora sem recarregar nada, então nenhum documento novo
    // chega para levar a classe "saindo" embora — e o <main> fica em
    // opacity: 0 indefinidamente, com só o cabeçalho (que está fora dele)
    // visível. Deixa o navegador rolar sozinho, que é o certo aqui.
    const mesmoDocumento =
      destino.origin === location.origin &&
      destino.pathname === location.pathname &&
      destino.search === location.search;

    if (mesmoDocumento) return;

    evento.preventDefault();

    document.documentElement.classList.add('saindo');
    setTimeout(() => {
      window.location.href = destino.href;
    }, DURACAO_MS);

    // Se a navegação não acontecer (o navegador pode barrá-la, ou o usuário
    // pode cancelar uma saída com alteração pendente), a página continua aqui
    // — e sem isso continuaria invisível. Some com o fade-out depois de um
    // tempo em que a troca de página já teria ocorrido.
    setTimeout(() => {
      document.documentElement.classList.remove('saindo');
    }, 2000);
  });
})();
