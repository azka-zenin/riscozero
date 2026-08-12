// middleware/seguranca.js
// Cabeçalhos de segurança aplicados a toda resposta, antes de qualquer rota —
// inclusive os arquivos estáticos, por isso entra cedo em server.js.
//
// São poucos cabeçalhos, então ficam explícitos aqui em vez de trazer o
// helmet como dependência nova para o projeto.

function seguranca(req, res, next) {
  // Impede o navegador de "adivinhar" o tipo de um arquivo pelo conteúdo —
  // sem isso, um arquivo enviado com Content-Type errado poderia ser
  // interpretado como script em navegadores antigos.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Impede que o sistema seja carregado dentro de um <iframe> de outro site —
  // a defesa clássica contra clickjacking (um site malicioso sobrepondo um
  // botão invisível de "Remover conta" por cima do que a pessoa acha que está
  // clicando).
  res.setHeader('X-Frame-Options', 'DENY');

  // Política de conteúdo: só carrega script do próprio domínio. O sistema não
  // usa CDN de propósito (fontes e Chart.js são servidos daqui mesmo), então
  // não precisa liberar nenhuma origem externa.
  //
  // style-src permite 'unsafe-inline' porque o painel monta parte da tela com
  // atributo style="" inline (o destaque do setor mais crítico em
  // dashboard.js, os links de admin escondidos até o JS decidir mostrar em
  // dashboard.html) — travar isso quebraria a interface, e trocar por classes
  // é mudança de outra frente, não deste ajuste de segurança.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );

  next();
}

module.exports = { seguranca };
