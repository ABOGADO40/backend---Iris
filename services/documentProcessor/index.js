/**
 * Document Processor Service - Exportaciones
 *
 * Servicio principal para procesamiento de documentos multi-formato
 */

const { DocumentProcessorService, documentProcessor } = require('./DocumentProcessorService');

// Parsers individuales (para uso avanzado)
const BaseParser = require('./parsers/BaseParser');
const PDFParser = require('./parsers/PDFParser');
const WordParser = require('./parsers/WordParser');
const ExcelParser = require('./parsers/ExcelParser');
const ImageParser = require('./parsers/ImageParser');
const WhatsAppParser = require('./parsers/WhatsAppParser');

// Utilidades
const TextCleaner = require('./utils/TextCleaner');

module.exports = {
  // Servicio principal (singleton)
  documentProcessor,

  // Clase del servicio (para crear instancias personalizadas)
  DocumentProcessorService,

  // Parsers
  BaseParser,
  PDFParser,
  WordParser,
  ExcelParser,
  ImageParser,
  WhatsAppParser,

  // Utilidades
  TextCleaner
};
