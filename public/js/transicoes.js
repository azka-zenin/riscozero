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

  document.addEventListener('click', (evento) => {
    const link = evento.target.closest('a[href]');
    if (!link) return;

    // Só intercepta navegação normal, dentro do próprio site, sem modificador
    // de teclado (abrir em nova aba, etc.) — tudo isso continua funcionando
    // exatamente como o navegador já faz por padrão.
    const mesmaAba = link.target === '' || link.target === '_self';
    const semModificador =
      !evento.metaKey && !evento.ctrlKey && !evento.shiftKey && !evento.altKey;
    const arquivoLocal = /\.html?($|\?|#)/.test(link.getAttribute('href') || '')
      || !link.getAttribute('href').includes(':');

    if (!mesmaAba || !semModificador || evento.button !== 0 || !arquivoLocal) return;

    const destino = link.href;
    evento.preventDefault();

    document.documentElement.classList.add('saindo');
    setTimeout(() => {
      window.location.href = destino;
    }, DURACAO_MS);
  });
})();
