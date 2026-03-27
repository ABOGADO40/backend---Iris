/**
 * WhatsAppParser - Parser para chats exportados de WhatsApp
 *
 * Soporta formatos de exportacion de WhatsApp (.txt y .zip con medios)
 */

const BaseParser = require('./BaseParser');
const AdmZip = require('adm-zip');
const fs = require('fs').promises;
const path = require('path');

class WhatsAppParser extends BaseParser {
  constructor(options = {}) {
    super({
      extractMedia: true,
      includeSystemMessages: false,
      formatOutput: true,
      ...options
    });
    this.supportedMimeTypes = [
      'text/plain',
      'application/zip',
      'application/x-zip-compressed'
    ];
    this.supportedExtensions = ['.txt', '.zip'];

    // Patrones de fecha/hora para diferentes formatos de WhatsApp
    this.datePatterns = [
      // [DD/MM/YY, HH:MM:SS] Nombre: Mensaje
      /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]\.?M\.?)?)\]\s*(.+?):\s*(.*)$/i,
      // DD/MM/YY HH:MM - Nombre: Mensaje
      /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]\.?M\.?)?)\s*-\s*(.+?):\s*(.*)$/i,
      // DD/MM/YYYY, HH:MM a. m. - Nombre: Mensaje (formato latinoamericano)
      /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?:\s*[AaPp]\.?\s*[Mm]\.?)?)\s*-\s*(.+?):\s*(.*)$/i,
      // MM/DD/YY, HH:MM AM/PM - Name: Message (formato USA)
      /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*-\s*(.+?):\s*(.*)$/i
    ];

    // Patrones para mensajes del sistema de WhatsApp
    this.systemPatterns = [
      /cambi[oó] el asunto/i,
      /cambi[oó] la descripci[oó]n/i,
      /cambi[oó] el icono/i,
      /a[nñ]adi[oó] a/i,
      /elimin[oó] a/i,
      /sali[oó] del grupo/i,
      /creó este grupo/i,
      /cambi[oó] la configuraci[oó]n/i,
      /mensaje eliminado/i,
      /cifrado de extremo a extremo/i,
      /changed the subject/i,
      /added/i,
      /removed/i,
      /left/i,
      /created group/i
    ];
  }

  canParse(filePath, mimeType) {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    // Verificar si es archivo de WhatsApp
    const isWhatsAppFile =
      fileName.includes('whatsapp') ||
      fileName.includes('chat') ||
      this.supportedExtensions.includes(ext);

    return isWhatsAppFile;
  }

  getSupportedMimeTypes() {
    return this.supportedMimeTypes;
  }

  getSupportedExtensions() {
    return this.supportedExtensions;
  }

  async parse(filePath, options = {}) {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };
    const ext = path.extname(filePath).toLowerCase();

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);

      if (ext === '.zip') {
        return await this.parseZipExport(filePath, mergedOptions, startTime);
      } else {
        return await this.parseTextExport(filePath, mergedOptions, startTime);
      }
    } catch (error) {
      return this.createErrorResult(`Error procesando chat WhatsApp: ${error.message}`, error);
    }
  }

  /**
   * Procesa un archivo .txt de chat exportado
   */
  async parseTextExport(filePath, options, startTime) {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    const parseResult = this.parseWhatsAppText(content, options);
    const processingTime = Date.now() - startTime;

    return this.createResult({
      text: parseResult.formattedText,
      images: [],
      processingTime,
      pageCount: null,
      metadata: {
        format: 'WhatsApp Chat Export',
        chatType: parseResult.chatType,
        participants: parseResult.participants,
        totalMessages: parseResult.totalMessages,
        dateRangeStart: parseResult.dateRange.start,
        dateRangeEnd: parseResult.dateRange.end,
        systemMessages: parseResult.systemMessagesCount,
        mediaReferences: parseResult.mediaReferences,
        fileSize: stats.size
      }
    });
  }

  /**
   * Procesa un archivo .zip con chat y medios
   */
  async parseZipExport(filePath, options, startTime) {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    // Buscar el archivo de texto del chat
    let chatEntry = null;
    const mediaFiles = [];

    for (const entry of zipEntries) {
      const name = entry.entryName.toLowerCase();
      if (name.endsWith('.txt') && !entry.isDirectory) {
        chatEntry = entry;
      } else if (!entry.isDirectory && this.isMediaFile(name)) {
        mediaFiles.push({
          name: entry.entryName,
          path: entry.entryName,
          size: entry.header.size
        });
      }
    }

    if (!chatEntry) {
      return this.createErrorResult('No se encontro archivo de chat en el ZIP');
    }

    // Parsear el contenido del chat
    const chatContent = zip.readAsText(chatEntry);
    const parseResult = this.parseWhatsAppText(chatContent, options);

    // Extraer imagenes si esta habilitado
    const images = [];
    if (options.extractMedia) {
      for (const entry of zipEntries) {
        if (!entry.isDirectory && this.isImageFile(entry.entryName)) {
          try {
            const imageBuffer = entry.getData();
            const ext = path.extname(entry.entryName).toLowerCase();
            images.push({
              base64: imageBuffer.toString('base64'),
              mimeType: this.getMediaMimeType(ext),
              pageNumber: null,
              index: images.length,
              ocrText: null,
              ocrConfidence: null,
              fileName: entry.entryName
            });
          } catch (imgError) {
            console.warn(`Error extrayendo imagen ${entry.entryName}:`, imgError.message);
          }
        }
      }
    }

    const stats = await fs.stat(filePath);
    const processingTime = Date.now() - startTime;

    return this.createResult({
      text: parseResult.formattedText,
      images,
      processingTime,
      pageCount: null,
      metadata: {
        format: 'WhatsApp Chat Export (ZIP)',
        chatType: parseResult.chatType,
        participants: parseResult.participants,
        totalMessages: parseResult.totalMessages,
        dateRangeStart: parseResult.dateRange.start,
        dateRangeEnd: parseResult.dateRange.end,
        systemMessages: parseResult.systemMessagesCount,
        mediaReferences: parseResult.mediaReferences,
        mediaFilesCount: mediaFiles.length,
        mediaFiles: mediaFiles.slice(0, 50), // Limitar a primeros 50
        fileSize: stats.size
      }
    });
  }

  /**
   * Parsea el contenido de texto de WhatsApp
   */
  parseWhatsAppText(content, options) {
    const lines = content.split('\n');
    const messages = [];
    const participants = new Set();
    let currentMessage = null;
    let systemMessagesCount = 0;
    let mediaReferences = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Intentar parsear como mensaje nuevo
      const parsed = this.parseMessageLine(trimmedLine);

      if (parsed) {
        // Si hay mensaje anterior, guardarlo
        if (currentMessage) {
          messages.push(currentMessage);
        }

        // Verificar si es mensaje del sistema
        const isSystem = this.isSystemMessage(parsed.content);
        if (isSystem) {
          systemMessagesCount++;
          if (!options.includeSystemMessages) {
            currentMessage = null;
            continue;
          }
        }

        // Verificar referencias a medios
        if (this.hasMediaReference(parsed.content)) {
          mediaReferences++;
        }

        participants.add(parsed.sender);

        currentMessage = {
          timestamp: parsed.timestamp,
          sender: parsed.sender,
          content: parsed.content,
          isSystem
        };
      } else if (currentMessage) {
        // Linea de continuacion del mensaje anterior
        currentMessage.content += '\n' + trimmedLine;
      }
    }

    // Agregar ultimo mensaje
    if (currentMessage) {
      messages.push(currentMessage);
    }

    // Determinar tipo de chat
    const chatType = participants.size <= 2 ? 'individual' : 'group';

    // Obtener rango de fechas
    const dateRange = {
      start: messages.length > 0 ? messages[0].timestamp : null,
      end: messages.length > 0 ? messages[messages.length - 1].timestamp : null
    };

    // Formatear texto para analisis
    const formattedText = this.formatMessages(messages, options);

    return {
      messages,
      participants: Array.from(participants),
      chatType,
      totalMessages: messages.length,
      dateRange,
      systemMessagesCount,
      mediaReferences,
      formattedText
    };
  }

  /**
   * Intenta parsear una linea como mensaje de WhatsApp
   */
  parseMessageLine(line) {
    for (const pattern of this.datePatterns) {
      const match = line.match(pattern);
      if (match) {
        const [, date, time, sender, content] = match;
        return {
          timestamp: `${date} ${time}`,
          sender: sender.trim(),
          content: content || ''
        };
      }
    }
    return null;
  }

  /**
   * Verifica si es un mensaje del sistema
   */
  isSystemMessage(content) {
    return this.systemPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Verifica si el mensaje referencia medios
   */
  hasMediaReference(content) {
    const mediaPatterns = [
      /\.(jpg|jpeg|png|gif|mp4|mp3|opus|ogg|pdf|webp)\s*\(archivo adjunto\)/i,
      /\(archivo adjunto\)/i,
      /\(attached\)/i,
      /imagen omitida/i,
      /video omitido/i,
      /audio omitido/i,
      /documento omitido/i,
      /image omitted/i,
      /video omitted/i,
      /audio omitted/i
    ];
    return mediaPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Verifica si es un archivo de media
   */
  isMediaFile(filename) {
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mp3', '.opus', '.ogg', '.pdf', '.webp', '.3gp', '.mov'];
    const ext = path.extname(filename).toLowerCase();
    return mediaExtensions.includes(ext);
  }

  /**
   * Verifica si es un archivo de imagen
   */
  isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
  }

  /**
   * Obtiene el tipo MIME de un archivo de media
   */
  getMediaMimeType(extension) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.opus': 'audio/opus',
      '.ogg': 'audio/ogg',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Formatea los mensajes para analisis
   */
  formatMessages(messages, options) {
    if (!options.formatOutput) {
      return messages.map(m =>
        `[${m.timestamp}] ${m.sender}: ${m.content}`
      ).join('\n');
    }

    const lines = ['=== CONVERSACION DE WHATSAPP ===\n'];

    let currentDate = null;
    for (const msg of messages) {
      // Separador de fecha
      const msgDate = msg.timestamp.split(',')[0]?.trim() || msg.timestamp.split(' ')[0];
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        lines.push(`\n--- ${msgDate} ---\n`);
      }

      // Formatear mensaje
      const time = msg.timestamp.split(',')[1]?.trim() || msg.timestamp.split(' ')[1] || '';
      const prefix = msg.isSystem ? '[SISTEMA]' : `[${time}] ${msg.sender}`;
      lines.push(`${prefix}: ${msg.content}`);
    }

    return lines.join('\n');
  }
}

module.exports = WhatsAppParser;
