// middleware/estaticos.js
// Entrega dos arquivos da pasta public (HTML, CSS, JS, fontes, ícones).
//
// POR QUE ISTO É UM MÓDULO E NÃO UMA LINHA DENTRO DO server.js: o modo de
// demonstração (testes/servidor-demo.js) monta um servidor próprio para rodar
// sem MongoDB, e precisa se comportar igual ao real — ele já compartilha o
// middleware de segurança pelo mesmo motivo. Enquanto a configuração ficava
// escrita nos dois lugares, ela divergiu de fato: o server.js passou a mandar
// o HTML sem cache e o de demonstração continuou mandando com uma hora, então
// conferir o comportamento pelo modo de demonstração mostrava o resultado
// errado. Com um módulo só, não há como um lado mudar sem o outro.

const express = require('express');
const path = require('path');

// A pasta é resolvida a partir DAQUI, não de quem chama: assim server.js (na
// raiz) e servidor-demo.js (em testes/) chegam no mesmo lugar sem cada um
// precisar acertar a quantidade de "..".
const PASTA_PUBLICA = path.join(__dirname, '..', 'public');

// maxAge curto (1h), não um valor grande: os nomes de arquivo aqui não mudam
// quando o conteúdo muda (não há um hash tipo style.abc123.css), então um
// cache longo faria alguém continuar vendo a versão antiga por bastante tempo
// depois de um push de última hora — justamente o tipo de ajuste que este time
// faz nos dias antes de apresentar. Uma hora já evita rebuscar fonte/CSS/JS a
// cada clique dentro da mesma sessão de demonstração, sem esse risco.
//
// O HTML é a exceção, e por causa do mesmo raciocínio levado até o fim: ele é
// quem aponta para todo o resto. Guardado por uma hora, um push feito minutos
// antes de apresentar não chegaria em quem já tinha aberto a página — nem
// recarregando, porque o navegador nem chega a perguntar ao servidor.
//
// no-cache não quer dizer "não guarde": quer dizer "guarde, mas confirme
// comigo antes de usar". A confirmação é uma requisição minúscula que costuma
// responder 304 (sem corpo), então o custo é quase nada e a garantia é que
// ninguém fica preso numa versão antiga.
const estaticos = express.static(PASTA_PUBLICA, {
  maxAge: '1h',
  setHeaders(res, caminho) {
    if (caminho.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
});

module.exports = { estaticos, PASTA_PUBLICA };
