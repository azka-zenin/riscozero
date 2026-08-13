// utils/email.js
// Aviso por e-mail quando um setor ENTRA em risco alto (não a cada resposta
// nova enquanto ele permanece em alto — isso encheria a caixa de entrada).
//
// POR QUE É OPCIONAL: a apresentação (Mostra Técnica 2026) não pode depender
// de internet estável só para o e-mail funcionar. Sem SMTP_HOST configurado
// no .env, o aviso vira só uma linha no log do servidor — o sistema continua
// funcionando normalmente, e o mesmo alerta já aparece no painel de qualquer
// forma. Ver .env.example para as variáveis.

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_SENHA = process.env.SMTP_SENHA;
const DESTINATARIOS = (process.env.EMAIL_ALERTA_DESTINATARIOS || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

const configurado = Boolean(SMTP_HOST && SMTP_USER && SMTP_SENHA && DESTINATARIOS.length > 0);

const transportador = configurado
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_SENHA },
    })
  : null;

// Guarda o último nível notificado de cada setor, só em memória — mesma
// filosofia dos contadores de middleware/limites.js: se o processo reiniciar,
// volta a zero, e o pior que acontece é um aviso repetido, não perdido.
const ultimoNivelPorSetor = new Map();

/**
 * Decide se vale mandar um aviso: só quando o setor ACABOU de entrar em
 * risco alto, não enquanto ele permanece lá. Cada chamada já atualiza o
 * estado guardado, então é seguro chamar a cada resposta nova.
 */
function precisaAvisar(setor, nivelAtual) {
  const nivelAnterior = ultimoNivelPorSetor.get(setor);
  ultimoNivelPorSetor.set(setor, nivelAtual);
  return nivelAtual === 'alto' && nivelAnterior !== 'alto';
}

async function avisarRiscoAlto(setorNome, indice) {
  const assunto = `RiscoZero — ${setorNome} entrou em risco alto`;
  const texto =
    `O setor ${setorNome} está com índice de risco ${indice.toFixed(2)} (escala de 1 a 5), ` +
    'classificado como Alto.\n\nAcesse o painel de gestão para ver os detalhes e registrar uma ação.';

  if (!configurado) {
    console.log(`[e-mail] SMTP não configurado — aviso ficou só no log: ${assunto}`);
    return { enviado: false };
  }

  try {
    await transportador.sendMail({
      from: SMTP_USER,
      to: DESTINATARIOS.join(','),
      subject: assunto,
      text: texto,
    });
    return { enviado: true };
  } catch (erro) {
    console.error('Erro ao enviar e-mail de alerta:', erro.message);
    return { enviado: false, erro: erro.message };
  }
}

module.exports = { configurado, precisaAvisar, avisarRiscoAlto };
