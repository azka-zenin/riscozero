// utils/pdf.js
// Gera o relatório em PDF a partir do mesmo resumo que o painel usa
// (montarResumo em routes/respostas.js). É feito no servidor, com pdfkit, e não
// com window.print(): o navegador não controla cabeçalho, quebra de página nem
// caixas com scroll, e por isso o resultado variava de uma máquina para outra.
//
// Comentários não entram aqui — ver GET /api/respostas/exportar-pdf.

const PDFDocument = require('pdfkit');
const config = require('../config');
const { NOMES_INDICADORES } = require('../utils/analise');

const MARGEM = 50;
const COR_TEXTO = '#1d1a16';
const COR_SUAVE = '#6b655c';
const COR_LINHA = '#d8d2c6';
const ALTURA_LINHA = 18;

const formatarHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: config.FUSO_HORARIO,
  dateStyle: 'short',
  timeStyle: 'short',
});

function numero(valor) {
  return typeof valor === 'number' && !Number.isNaN(valor)
    ? valor.toFixed(2).replace('.', ',')
    : '-';
}

/** Quebra de página quando o próximo bloco não cabe mais na folha. */
function garantirEspaco(doc, altura) {
  const limite = doc.page.height - doc.page.margins.bottom;
  if (doc.y + altura > limite) doc.addPage();
}

function titulo(doc, texto) {
  garantirEspaco(doc, 60);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COR_TEXTO).text(texto);
  doc.moveDown(0.3);
}

function linhaDado(doc, rotulo, valor) {
  doc.font('Helvetica').fontSize(10).fillColor(COR_SUAVE).text(`${rotulo}: `, { continued: true });
  doc.font('Helvetica-Bold').fillColor(COR_TEXTO).text(valor);
}

function item(doc, texto) {
  garantirEspaco(doc, 16);
  doc.font('Helvetica').fontSize(10).fillColor(COR_TEXTO).text(`•  ${texto}`, { indent: 10 });
}

/**
 * Desenha uma tabela simples: cabeçalho em destaque, uma linha por registro,
 * régua entre as linhas. Cada célula cabe em uma linha, então o texto mais
 * longo precisa caber na largura da coluna — os nomes de setor e turno cabem.
 */
function tabela(doc, cabecalhos, linhas, larguras) {
  const largura = larguras.reduce((soma, l) => soma + l, 0);

  const desenharLinha = (valores, estilo) => {
    garantirEspaco(doc, ALTURA_LINHA);
    const y = doc.y;
    let x = MARGEM;
    doc.font(estilo.fonte).fontSize(9.5).fillColor(estilo.cor);
    valores.forEach((valor, i) => {
      doc.text(String(valor), x + 4, y + 4, { width: larguras[i] - 8, lineBreak: false, ellipsis: true });
      x += larguras[i];
    });
    doc.moveTo(MARGEM, y + ALTURA_LINHA).lineTo(MARGEM + largura, y + ALTURA_LINHA)
      .strokeColor(COR_LINHA).lineWidth(0.5).stroke();
    // doc.text com posição explícita deixa o X na última coluna; voltamos à margem.
    doc.x = MARGEM;
    doc.y = y + ALTURA_LINHA;
  };

  desenharLinha(cabecalhos, { fonte: 'Helvetica-Bold', cor: COR_SUAVE });
  linhas.forEach((valores) => desenharLinha(valores, { fonte: 'Helvetica', cor: COR_TEXTO }));
  doc.y += 6;
}

/**
 * @param resumo o objeto devolvido por montarResumo()
 * @returns {Promise<Buffer>} o PDF pronto para enviar
 */
function gerarPdfResumo(resumo) {
  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGEM,
      bufferPages: true,
      info: { Title: 'RiscoZero - Relatório de riscos psicossociais', Author: 'RiscoZero' },
    });

    const pedacos = [];
    doc.on('data', (pedaco) => pedacos.push(pedaco));
    doc.on('end', () => resolver(Buffer.concat(pedacos)));
    doc.on('error', rejeitar);

    const larguraUtil = doc.page.width - MARGEM * 2;

    doc.font('Helvetica-Bold').fontSize(18).fillColor(COR_TEXTO)
      .text('RiscoZero — Relatório de riscos psicossociais', { width: larguraUtil });
    doc.font('Helvetica').fontSize(10).fillColor(COR_SUAVE)
      .text(`${resumo.periodo} · gerado em ${formatarHora.format(new Date())}`);

    if (!resumo.geral || resumo.geral.total === 0) {
      doc.moveDown(1).font('Helvetica').fontSize(12).fillColor(COR_TEXTO)
        .text('Não há respostas registradas neste período.');
    } else {
      const { geral } = resumo;

      titulo(doc, 'Visão geral');
      linhaDado(doc, 'Índice de risco geral', `${numero(resumo.indiceRisco)} (${resumo.classificacao.rotulo})`);
      linhaDado(doc, 'Respostas no período', String(geral.total));
      linhaDado(doc, 'Última resposta', formatarHora.format(new Date(geral.ultima_resposta)));

      titulo(doc, 'Indicadores médios (escala de 1 a 5)');
      tabela(
        doc,
        ['Indicador', 'Média', 'Leitura'],
        [
          [NOMES_INDICADORES.estresse, numero(geral.media_estresse), 'quanto maior, pior'],
          [NOMES_INDICADORES.sono, numero(geral.media_sono), 'quanto maior, melhor'],
          [NOMES_INDICADORES.carga_trabalho, numero(geral.media_carga_trabalho), 'quanto maior, pior'],
          [NOMES_INDICADORES.ambiente_fisico, numero(geral.media_ambiente_fisico), 'quanto maior, melhor'],
        ],
        [200, 80, larguraUtil - 280],
      );

      titulo(doc, 'Risco por setor');
      tabela(
        doc,
        ['Setor', 'Respostas', 'Índice', 'Nível', 'Tendência'],
        resumo.porSetor.map((s) => [
          s.setorNome,
          s.total,
          numero(s.indiceRisco),
          s.classificacao.rotulo,
          s.tendencia.rotulo,
        ]),
        [160, 80, 70, 85, larguraUtil - 395],
      );

      if (resumo.porTurno.length > 0) {
        titulo(doc, 'Risco por turno');
        tabela(
          doc,
          ['Turno', 'Respostas', 'Índice', 'Nível'],
          resumo.porTurno.map((t) => [t.turnoNome, t.total, numero(t.indiceRisco), t.classificacao.rotulo]),
          [170, 100, 100, larguraUtil - 370],
        );
      }

      titulo(doc, 'Alertas');
      if (resumo.alertas.length === 0) {
        item(doc, 'Nenhum setor com alerta no período.');
      } else {
        resumo.alertas.forEach((alerta) => item(doc, alerta.mensagem));
      }

      titulo(doc, 'Recomendações por setor');
      if (resumo.recomendacoesPorSetor.length === 0) {
        item(doc, 'Nenhum setor precisa de ação no período.');
      }
      resumo.recomendacoesPorSetor.forEach((setor) => {
        garantirEspaco(doc, 40);
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(COR_TEXTO)
          .text(`${setor.setorNome} — ${setor.urgencia.rotulo}`);
        setor.recomendacoes.forEach((bloco) => {
          garantirEspaco(doc, 30);
          doc.font('Helvetica-Bold').fontSize(10).fillColor(COR_SUAVE).text(bloco.titulo);
          bloco.acoes.forEach((acao) => item(doc, acao));
        });
      });

      doc.moveDown(1);
      doc.font('Helvetica').fontSize(8).fillColor(COR_SUAVE).text(
        'Os comentários dos trabalhadores não entram neste relatório, para preservar o anonimato. '
        + 'Eles aparecem no painel, quando há respostas suficientes em cada setor.',
        { width: larguraUtil },
      );
    }

    // Rodapé com a paginação. Feito por último, quando já se sabe o total de
    // páginas. A margem inferior é zerada para o rodapé não disparar uma página nova.
    const total = doc.bufferedPageRange().count;
    doc.page.margins.bottom = 0;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor(COR_SUAVE).text(
        `RiscoZero · página ${i + 1} de ${total}`,
        MARGEM,
        doc.page.height - 30,
        { width: larguraUtil, align: 'center', lineBreak: false },
      );
    }

    doc.end();
  });
}

module.exports = { gerarPdfResumo };
