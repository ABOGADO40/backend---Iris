// =====================================================
// SISTEMA IRIS - Export Service
// Servicio de exportacion a PDF, DOCX y PPTX
// =====================================================

const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');
const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const storageService = require('./storageService');

// =====================================================
// CONFIGURACION
// =====================================================

const EXPORTS_PATH = process.env.EXPORTS_PATH || path.join(__dirname, '..', 'uploads', 'exports');
const { DISCLAIMER } = require('../utils/constants');

// Asegurar que el directorio de exportaciones existe
if (!fs.existsSync(EXPORTS_PATH)) {
  fs.mkdirSync(EXPORTS_PATH, { recursive: true });
}

// =====================================================
// UTILIDADES
// =====================================================

/**
 * Genera un nombre de archivo unico
 */
function generateFileName(format) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueId = uuidv4().substring(0, 8);
  return `analisis_${timestamp}_${uniqueId}.${format}`;
}

/**
 * Parsea el contenido estructurado del resultado
 */
function parseStructuredContent(analysisResult) {
  const sections = [];
  const content = analysisResult.resultText || '';

  // Intentar extraer secciones del texto
  const lines = content.split('\n');
  let currentSection = { title: 'Contenido', content: [] };

  for (const line of lines) {
    // Detectar titulos de seccion (## o lineas en mayusculas seguidas de :)
    if (line.match(/^##\s+(.+)/) || line.match(/^([A-Z][A-Z\s]+):?\s*$/)) {
      if (currentSection.content.length > 0) {
        sections.push(currentSection);
      }
      const titleMatch = line.match(/^##\s+(.+)/) || line.match(/^([A-Z][A-Z\s]+):?\s*$/);
      currentSection = {
        title: titleMatch[1].trim(),
        content: []
      };
    } else if (line.trim()) {
      currentSection.content.push(line);
    }
  }

  if (currentSection.content.length > 0) {
    sections.push(currentSection);
  }

  // Si no se encontraron secciones, usar todo como una seccion
  if (sections.length === 0) {
    sections.push({
      title: 'Resultado del Analisis',
      content: content.split('\n').filter(l => l.trim())
    });
  }

  return sections;
}

/**
 * Formatea el tipo de servicio
 */
function formatServiceType(serviceType) {
  const types = {
    TRANSLATE: 'Traduccion a Lenguaje Comun',
    RECOMMEND: 'Recomendacion de Peritajes',
    COMPARE: 'Comparacion de Peritajes',
    OBJECTIONS: 'Objeciones Tecnicas'
  };
  return types[serviceType] || serviceType;
}

// =====================================================
// GENERADOR DE PDF
// =====================================================

/**
 * Genera un documento PDF
 * @param {Object} analysisResult - Resultado del analisis
 * @param {string} [customDisclaimer] - Disclaimer personalizado
 * @param {Array} [chatMessages] - Mensajes del chat opcionales
 * @returns {Promise<{filePath: string, fileName: string, fileSize: number}>}
 */
async function generatePDF(analysisResult, customDisclaimer = DISCLAIMER, chatMessages = null) {
  return new Promise((resolve, reject) => {
    try {
      const fileName = generateFileName('pdf');
      const filePath = path.join(EXPORTS_PATH, fileName);
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: 'Sistema IRIS - Analisis',
          Author: 'Sistema IRIS',
          Subject: 'Analisis de IA',
          Creator: 'Sistema IRIS - Exportacion'
        }
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // === COLORES DEL DISEÑO ===
      const COLORS = {
        primary: '#1a365d',      // Azul oscuro profesional
        secondary: '#2d3748',    // Gris oscuro
        accent: '#3182ce',       // Azul acento
        userBg: '#ebf8ff',       // Fondo azul claro para usuario
        userBorder: '#3182ce',   // Borde azul para usuario
        userText: '#1a365d',     // Texto azul oscuro
        aiBg: '#f7fafc',         // Fondo gris claro para IA
        aiBorder: '#718096',     // Borde gris para IA
        aiText: '#2d3748',       // Texto gris oscuro
        disclaimer: '#c53030',   // Rojo para disclaimer
        muted: '#718096'         // Gris para textos secundarios
      };

      // === ENCABEZADO ===
      doc.fontSize(22)
        .font('Helvetica-Bold')
        .fillColor(COLORS.primary)
        .text('SISTEMA IRIS', { align: 'center' });

      doc.fontSize(12)
        .font('Helvetica')
        .fillColor(COLORS.muted)
        .text('Informe de Analisis con Inteligencia Artificial', { align: 'center' });

      doc.moveDown(0.5);

      // Linea decorativa doble
      const lineY = doc.y;
      doc.moveTo(50, lineY).lineTo(545, lineY).lineWidth(2).stroke(COLORS.primary);
      doc.moveTo(50, lineY + 4).lineTo(545, lineY + 4).lineWidth(0.5).stroke(COLORS.accent);

      doc.moveDown(1.5);

      // === INFORMACION DEL ANALISIS ===
      const request = analysisResult.analysisRequest || {};

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(COLORS.secondary)
        .text('DATOS DEL ANALISIS', { underline: true });

      doc.moveDown(0.3);

      doc.fontSize(9)
        .font('Helvetica')
        .fillColor(COLORS.secondary);

      doc.text(`Tipo: ${formatServiceType(request.serviceType || 'N/A')}`, { continued: false });
      doc.text(`Fecha: ${new Date(analysisResult.dateTimeRegistration || Date.now()).toLocaleString('es-ES')}`, { continued: false });

      if (request.aiProvider || request.aiModel) {
        doc.text(`Modelo: ${request.aiProvider || ''} ${request.aiModel || ''}`.trim(), { continued: false });
      }

      doc.moveDown(1.5);

      // === RESULTADO DEL ANALISIS ===
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(COLORS.primary)
        .text('RESULTADO DEL ANALISIS');

      doc.moveDown(0.5);

      const sections = parseStructuredContent(analysisResult);

      for (const section of sections) {
        doc.fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(COLORS.secondary)
          .text(section.title);

        doc.moveDown(0.3);

        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#333');

        for (const line of section.content) {
          if (line.trim().match(/^[-*]\s/)) {
            doc.text(`  ${line.trim()}`, { indent: 15 });
          } else if (line.trim().match(/^\d+\.\s/)) {
            doc.text(`  ${line.trim()}`, { indent: 10 });
          } else {
            doc.text(line, { align: 'justify' });
          }
        }

        doc.moveDown(0.5);
      }

      // === CONVERSACION DEL CHAT ===
      if (chatMessages && chatMessages.length > 0) {
        doc.addPage();

        // Encabezado de seccion de chat
        doc.fontSize(14)
          .font('Helvetica-Bold')
          .fillColor(COLORS.primary)
          .text('CONVERSACION CON ASISTENTE IA', { align: 'center' });

        doc.moveDown(0.3);

        doc.fontSize(9)
          .font('Helvetica')
          .fillColor(COLORS.muted)
          .text('Registro completo del dialogo entre el usuario y el asistente de inteligencia artificial', { align: 'center' });

        doc.moveDown(1);

        // Linea separadora
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1).stroke(COLORS.accent);
        doc.moveDown(1);

        // Renderizar cada mensaje
        for (let i = 0; i < chatMessages.length; i++) {
          const msg = chatMessages[i];
          const isUser = msg.role === 'user';
          const pageWidth = doc.page.width - 100; // margen de 50 cada lado

          // Verificar si necesitamos nueva pagina
          if (doc.y > doc.page.height - 150) {
            doc.addPage();
          }

          // === ESTILO DE MENSAJE ===
          const msgX = 50;
          const msgWidth = pageWidth;
          const startY = doc.y;

          // Etiqueta del remitente
          doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor(isUser ? COLORS.userBorder : COLORS.aiBorder)
            .text(
              isUser ? 'USUARIO' : 'ASISTENTE IA',
              msgX + 10,
              startY,
              { continued: false }
            );

          doc.moveDown(0.3);

          // Contenido del mensaje con borde lateral
          const contentStartY = doc.y;

          // Dibujar barra lateral decorativa
          const barWidth = 4;
          const barColor = isUser ? COLORS.userBorder : COLORS.aiBorder;

          // Calcular altura del texto
          const textOptions = {
            width: msgWidth - 25,
            align: 'justify'
          };

          // Guardar posicion Y antes del texto
          const textStartY = doc.y;

          // Escribir el contenido
          doc.fontSize(10)
            .font('Helvetica')
            .fillColor(isUser ? COLORS.userText : COLORS.aiText)
            .text(msg.content || '', msgX + 15, textStartY, textOptions);

          const textEndY = doc.y;
          const textHeight = textEndY - contentStartY;

          // Dibujar la barra lateral
          doc.rect(msgX, contentStartY - 2, barWidth, textHeight + 8)
            .fill(barColor);

          doc.moveDown(1);

          // Linea sutil entre mensajes
          if (i < chatMessages.length - 1) {
            doc.moveTo(100, doc.y - 5)
              .lineTo(495, doc.y - 5)
              .lineWidth(0.3)
              .stroke('#e2e8f0');
            doc.moveDown(0.5);
          }
        }
      }

      // === DISCLAIMER ===
      doc.moveDown(2);

      // Verificar si hay espacio, si no, nueva pagina
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }

      // Caja de disclaimer
      const disclaimerY = doc.y;
      doc.moveTo(50, disclaimerY).lineTo(545, disclaimerY).lineWidth(1).stroke(COLORS.disclaimer);

      doc.moveDown(0.5);

      doc.fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(COLORS.disclaimer)
        .text('AVISO LEGAL', { align: 'center' });

      doc.moveDown(0.3);

      doc.fontSize(8)
        .font('Helvetica-Oblique')
        .fillColor(COLORS.disclaimer)
        .text(customDisclaimer, { align: 'justify' });

      // === PIE DE PAGINA ===
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.fontSize(8)
          .font('Helvetica')
          .fillColor(COLORS.muted)
          .text(
            `Pagina ${i + 1} de ${range.count} | Sistema IRIS | Documento generado automaticamente`,
            50,
            doc.page.height - 30,
            { align: 'center', width: doc.page.width - 100 }
          );
      }

      doc.end();

      writeStream.on('finish', async () => {
        try {
          const stats = fs.statSync(filePath);
          const fileSize = stats.size;

          // Subir a S3 si esta configurado
          let finalPath = filePath;
          if (storageService.useS3()) {
            const s3Key = `exports/${fileName}`;
            finalPath = await storageService.upload(filePath, s3Key, { contentType: 'application/pdf' });
            // Eliminar archivo local temporal
            try { fs.unlinkSync(filePath); } catch (e) { /* ignorar */ }
          }

          resolve({ filePath: finalPath, fileName, fileSize });
        } catch (uploadError) {
          reject(uploadError);
        }
      });

      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

// =====================================================
// GENERADOR DE DOCX
// =====================================================

/**
 * Genera un documento DOCX
 * @param {Object} analysisResult - Resultado del analisis
 * @param {string} [customDisclaimer] - Disclaimer personalizado
 * @param {Array} [chatMessages] - Mensajes del chat opcionales
 * @returns {Promise<{filePath: string, fileName: string, fileSize: number}>}
 */
async function generateDOCX(analysisResult, customDisclaimer = DISCLAIMER, chatMessages = null) {
  const fileName = generateFileName('docx');
  const filePath = path.join(EXPORTS_PATH, fileName);

  const request = analysisResult.analysisRequest || {};
  const sections = parseStructuredContent(analysisResult);

  // === COLORES DEL DISEÑO ===
  const COLORS = {
    primary: '1a365d',
    secondary: '2d3748',
    accent: '3182ce',
    userBorder: '3182ce',
    userText: '1a365d',
    aiBorder: '718096',
    aiText: '2d3748',
    disclaimer: 'c53030',
    muted: '718096'
  };

  const children = [];

  // === TITULO PRINCIPAL ===
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'SISTEMA IRIS',
          bold: true,
          size: 44,
          color: COLORS.primary
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 }
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Informe de Analisis con Inteligencia Artificial',
          size: 24,
          color: COLORS.muted
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    })
  );

  // Linea decorativa
  children.push(
    new Paragraph({
      children: [],
      border: {
        bottom: {
          color: COLORS.primary,
          space: 1,
          style: BorderStyle.SINGLE,
          size: 12
        }
      },
      spacing: { after: 300 }
    })
  );

  // === DATOS DEL ANALISIS ===
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'DATOS DEL ANALISIS',
          bold: true,
          size: 22,
          color: COLORS.secondary
        })
      ],
      spacing: { after: 150 }
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Tipo: ', bold: true, size: 20, color: COLORS.secondary }),
        new TextRun({ text: formatServiceType(request.serviceType || 'N/A'), size: 20 })
      ],
      spacing: { after: 80 }
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Fecha: ', bold: true, size: 20, color: COLORS.secondary }),
        new TextRun({ text: new Date(analysisResult.dateTimeRegistration || Date.now()).toLocaleString('es-ES'), size: 20 })
      ],
      spacing: { after: 80 }
    })
  );

  if (request.aiProvider || request.aiModel) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Modelo: ', bold: true, size: 20, color: COLORS.secondary }),
          new TextRun({ text: `${request.aiProvider || ''} ${request.aiModel || ''}`.trim(), size: 20 })
        ],
        spacing: { after: 300 }
      })
    );
  }

  // === RESULTADO DEL ANALISIS ===
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'RESULTADO DEL ANALISIS',
          bold: true,
          size: 26,
          color: COLORS.primary
        })
      ],
      spacing: { before: 200, after: 200 }
    })
  );

  for (const section of sections) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.title,
            bold: true,
            size: 24,
            color: COLORS.secondary
          })
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    for (const line of section.content) {
      const isBullet = line.trim().match(/^[-*]\s/);
      const isNumbered = line.trim().match(/^\d+\.\s/);

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, ''),
              size: 22
            })
          ],
          bullet: isBullet ? { level: 0 } : undefined,
          numbering: isNumbered ? { reference: 'default-numbering', level: 0 } : undefined,
          spacing: { after: 80 }
        })
      );
    }
  }

  // === CONVERSACION DEL CHAT ===
  if (chatMessages && chatMessages.length > 0) {
    // Separador
    children.push(
      new Paragraph({
        children: [],
        spacing: { before: 400 }
      })
    );

    // Titulo de seccion de chat
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'CONVERSACION CON ASISTENTE IA',
            bold: true,
            size: 28,
            color: COLORS.primary
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Registro completo del dialogo entre el usuario y el asistente de inteligencia artificial',
            size: 18,
            italics: true,
            color: COLORS.muted
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      })
    );

    // Linea separadora
    children.push(
      new Paragraph({
        children: [],
        border: {
          bottom: {
            color: COLORS.accent,
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6
          }
        },
        spacing: { after: 300 }
      })
    );

    // Renderizar cada mensaje
    for (let i = 0; i < chatMessages.length; i++) {
      const msg = chatMessages[i];
      const isUser = msg.role === 'user';

      // Etiqueta del remitente con icono visual
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: isUser ? '■ USUARIO' : '● ASISTENTE IA',
              bold: true,
              size: 18,
              color: isUser ? COLORS.userBorder : COLORS.aiBorder
            })
          ],
          spacing: { before: 200, after: 80 }
        })
      );

      // Contenido del mensaje con borde lateral
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: msg.content || '',
              size: 22,
              color: isUser ? COLORS.userText : COLORS.aiText
            })
          ],
          border: {
            left: {
              color: isUser ? COLORS.userBorder : COLORS.aiBorder,
              space: 10,
              style: BorderStyle.SINGLE,
              size: 18
            }
          },
          indent: { left: 200 },
          spacing: { after: 150 }
        })
      );

      // Linea sutil entre mensajes
      if (i < chatMessages.length - 1) {
        children.push(
          new Paragraph({
            children: [],
            border: {
              bottom: {
                color: 'e2e8f0',
                space: 1,
                style: BorderStyle.SINGLE,
                size: 2
              }
            },
            spacing: { after: 100 }
          })
        );
      }
    }
  }

  // === DISCLAIMER ===
  children.push(
    new Paragraph({
      children: [],
      spacing: { before: 400 },
      border: {
        top: {
          color: COLORS.disclaimer,
          space: 1,
          style: BorderStyle.SINGLE,
          size: 6
        }
      }
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'AVISO LEGAL',
          bold: true,
          size: 18,
          color: COLORS.disclaimer
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 100 }
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: customDisclaimer,
          italics: true,
          size: 18,
          color: COLORS.disclaimer
        })
      ],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 }
    })
  );

  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  // Subir a S3 si esta configurado
  let finalPath = filePath;
  if (storageService.useS3()) {
    const s3Key = `exports/${fileName}`;
    finalPath = await storageService.upload(filePath, s3Key, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    try { fs.unlinkSync(filePath); } catch (e) { /* ignorar */ }
  }

  return {
    filePath: finalPath,
    fileName,
    fileSize
  };
}

// =====================================================
// GENERADOR DE PPTX
// =====================================================

/**
 * Genera una presentacion PPTX
 * @param {Object} analysisResult - Resultado del analisis
 * @param {string} [customDisclaimer] - Disclaimer personalizado
 * @returns {Promise<{filePath: string, fileName: string, fileSize: number}>}
 */
async function generatePPTX(analysisResult, customDisclaimer = DISCLAIMER) {
  const fileName = generateFileName('pptx');
  const filePath = path.join(EXPORTS_PATH, fileName);

  const pptx = new PptxGenJS();

  pptx.author = 'Sistema IRIS';
  pptx.title = 'Analisis de IA';
  pptx.subject = 'Resultado de Analisis';
  pptx.company = 'Sistema IRIS';

  const request = analysisResult.analysisRequest || {};
  const sections = parseStructuredContent(analysisResult);

  // Slide de titulo
  const titleSlide = pptx.addSlide();
  titleSlide.addText('SISTEMA IRIS', {
    x: 0.5,
    y: 2,
    w: '90%',
    h: 1,
    fontSize: 44,
    bold: true,
    color: '2c3e50',
    align: 'center'
  });

  titleSlide.addText('Analisis de Inteligencia Artificial', {
    x: 0.5,
    y: 3,
    w: '90%',
    h: 0.5,
    fontSize: 24,
    color: '7f8c8d',
    align: 'center'
  });

  titleSlide.addText(formatServiceType(request.serviceType || 'N/A'), {
    x: 0.5,
    y: 4,
    w: '90%',
    h: 0.5,
    fontSize: 20,
    color: '3498db',
    align: 'center'
  });

  titleSlide.addText(`Generado: ${new Date(analysisResult.dateTimeRegistration || Date.now()).toLocaleString('es-ES')}`, {
    x: 0.5,
    y: 5,
    w: '90%',
    h: 0.3,
    fontSize: 14,
    color: '999999',
    align: 'center'
  });

  // Slides de contenido
  for (const section of sections) {
    const slide = pptx.addSlide();

    // Titulo de la seccion
    slide.addText(section.title, {
      x: 0.5,
      y: 0.3,
      w: '90%',
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: '2c3e50'
    });

    // Contenido
    const contentText = section.content.join('\n');
    const maxCharsPerSlide = 800;

    if (contentText.length <= maxCharsPerSlide) {
      slide.addText(contentText, {
        x: 0.5,
        y: 1.3,
        w: '90%',
        h: 4,
        fontSize: 14,
        color: '333333',
        valign: 'top',
        bullet: section.content.some(l => l.trim().match(/^[-*]\s/))
      });
    } else {
      // Dividir en multiples slides si es muy largo
      const chunks = [];
      let currentChunk = [];
      let currentLength = 0;

      for (const line of section.content) {
        if (currentLength + line.length > maxCharsPerSlide && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentLength = 0;
        }
        currentChunk.push(line);
        currentLength += line.length;
      }
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      // Primera parte en este slide
      slide.addText(chunks[0].join('\n'), {
        x: 0.5,
        y: 1.3,
        w: '90%',
        h: 4,
        fontSize: 14,
        color: '333333',
        valign: 'top'
      });

      // Slides adicionales si es necesario
      for (let i = 1; i < chunks.length; i++) {
        const contSlide = pptx.addSlide();
        contSlide.addText(`${section.title} (continuacion)`, {
          x: 0.5,
          y: 0.3,
          w: '90%',
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: '2c3e50'
        });
        contSlide.addText(chunks[i].join('\n'), {
          x: 0.5,
          y: 1.3,
          w: '90%',
          h: 4,
          fontSize: 14,
          color: '333333',
          valign: 'top'
        });
      }
    }
  }

  // Slide de disclaimer
  const disclaimerSlide = pptx.addSlide();
  disclaimerSlide.addText('Aviso Legal', {
    x: 0.5,
    y: 2,
    w: '90%',
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: 'c0392b',
    align: 'center'
  });

  disclaimerSlide.addText(customDisclaimer, {
    x: 0.5,
    y: 3,
    w: '90%',
    h: 2,
    fontSize: 16,
    color: '666666',
    align: 'center',
    valign: 'middle',
    italic: true
  });

  // Guardar archivo
  await pptx.writeFile({ fileName: filePath });

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  // Subir a S3 si esta configurado
  let finalPath = filePath;
  if (storageService.useS3()) {
    const s3Key = `exports/${fileName}`;
    finalPath = await storageService.upload(filePath, s3Key, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    });
    try { fs.unlinkSync(filePath); } catch (e) { /* ignorar */ }
  }

  return {
    filePath: finalPath,
    fileName,
    fileSize
  };
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  generatePDF,
  generateDOCX,
  generatePPTX,
  DISCLAIMER,
  EXPORTS_PATH
};
