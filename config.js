// config.js
// Configurações centrais do sistema. Deixamos tudo aqui para que a equipe
// possa mudar limites e senha sem precisar caçar valores espalhados no código.

/**
 * Lê um número de variável de ambiente, caindo no padrão quando ela não existe
 * ou não é número.
 *
 * POR QUE NÃO `Number(process.env.X) || padrao`: naquele formato, um valor
 * legítimo de 0 é falso em JavaScript e seria silenciosamente trocado pelo
 * padrão — quem configurasse MINIMO_RESPOSTAS_ALERTA=0 para uma demonstração
 * continuaria com 3, sem nenhum aviso de que a configuração foi ignorada.
 */
function numeroDoAmbiente(valor, padrao) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return padrao;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : padrao;
}

module.exports = {
  // Porta do servidor
  PORTA: process.env.PORT || 3000,

  // Fuso horário usado para agrupar respostas por dia.
  //
  // POR QUE ISSO IMPORTA: o MongoDB guarda toda data em UTC. Sem informar o
  // fuso, uma resposta enviada às 22h no horário de Brasília (01h em UTC)
  // seria contada no dia SEGUINTE nos gráficos — o painel mostraria picos de
  // risco em dias errados, e ninguém entenderia o porquê.
  FUSO_HORARIO: 'America/Sao_Paulo',

  // Faixas do índice de risco (escala 1 a 5, onde maior = mais risco).
  // Como MINIMO_RESPOSTAS_COMENTARIO logo abaixo, dá para ajustar por
  // variável de ambiente sem mexer no código — útil se a banca ou a empresa
  // pedir um critério diferente de última hora, sem precisar de novo deploy.
  LIMITES_RISCO: {
    BAIXO_ATE: numeroDoAmbiente(process.env.LIMITE_RISCO_BAIXO_ATE, 2.2),
    MEDIO_ATE: numeroDoAmbiente(process.env.LIMITE_RISCO_MEDIO_ATE, 3.4),
    // acima de MEDIO_ATE é considerado ALTO
  },

  // A partir de qual média um indicador individual já vira motivo de alerta
  LIMITE_ALERTA_INDICADOR: numeroDoAmbiente(process.env.LIMITE_ALERTA_INDICADOR, 3.5),

  // Mínimo de respostas em um setor para que ele gere alerta.
  // Evita que uma única resposta ruim dispare alarme falso.
  MINIMO_RESPOSTAS_ALERTA: numeroDoAmbiente(process.env.MINIMO_RESPOSTAS_ALERTA, 3),

  // Mínimo de respostas em um setor para que os COMENTÁRIOS daquele setor
  // apareçam no painel.
  //
  // POR QUE ISSO EXISTE — é a proteção mais importante do sistema:
  // Não gravar o nome de quem respondeu não basta para garantir anonimato. Um
  // comentário em texto livre, junto do setor e do turno, pode identificar a
  // pessoa por dedução — principalmente no turno da noite, que costuma ter
  // pouca gente. Quem conhece a escala de trabalho consegue deduzir quem
  // escreveu, e isso é exatamente o que faria alguém deixar de responder com
  // sinceridade.
  //
  // Com este limite, um comentário só aparece quando está diluído entre
  // outros do mesmo setor no mesmo período. Abaixo disso, o painel avisa que
  // existem comentários ocultos, mas não mostra o conteúdo.
  //
  // O número 5 é uma escolha nossa, não uma norma: quanto maior, mais
  // protegido e menos visível. Se a empresa tiver setores muito pequenos,
  // vale aumentar — dá para ajustar sem mexer no código, pela variável de
  // ambiente MINIMO_RESPOSTAS_COMENTARIO.
  MINIMO_RESPOSTAS_COMENTARIO: numeroDoAmbiente(process.env.MINIMO_RESPOSTAS_COMENTARIO, 5),
};
