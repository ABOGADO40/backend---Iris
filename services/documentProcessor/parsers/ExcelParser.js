/**
 * ExcelParser - Parser para archivos Excel (XLSX y XLS)
 *
 * Utiliza xlsx para extraccion de datos
 */

const BaseParser = require('./BaseParser');
const XLSX = require('xlsx');
const fs = require('fs').promises;
const path = require('path');

class ExcelParser extends BaseParser {
  constructor(options = {}) {
    super({
      includeHeaders: true,
      maxRows: 10000,
      maxColumns: 100,
      formatAsTable: true,
      ...options
    });
    this.supportedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
      'application/vnd.ms-excel', // XLS
      'application/vnd.oasis.opendocument.spreadsheet' // ODS
    ];
    this.supportedExtensions = ['.xlsx', '.xls', '.ods', '.csv'];
  }

  canParse(filePath, mimeType) {
    const ext = path.extname(filePath).toLowerCase();
    return (
      this.supportedMimeTypes.includes(mimeType) ||
      this.supportedExtensions.includes(ext)
    );
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

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);

      // Leer el archivo Excel
      const buffer = await fs.readFile(filePath);
      const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: true,
        cellNF: false,
        cellText: false
      });

      // Procesar todas las hojas
      const sheets = [];
      let totalRows = 0;
      let allText = '';

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const sheetData = this.processSheet(sheet, sheetName, mergedOptions);
        sheets.push(sheetData);
        totalRows += sheetData.rowCount;

        // Agregar texto de la hoja
        if (mergedOptions.formatAsTable) {
          allText += `\n=== HOJA: ${sheetName} ===\n`;
          allText += sheetData.formattedText;
        } else {
          allText += `\n${sheetName}:\n${sheetData.text}`;
        }
      }

      const processingTime = Date.now() - startTime;
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();

      return this.createResult({
        text: allText.trim(),
        images: [],
        processingTime,
        pageCount: workbook.SheetNames.length,
        metadata: {
          format: ext.toUpperCase().replace('.', ''),
          sheetCount: workbook.SheetNames.length,
          sheetNames: workbook.SheetNames,
          totalRows,
          sheets: sheets.map(s => ({
            name: s.name,
            rowCount: s.rowCount,
            columnCount: s.columnCount,
            hasHeaders: s.hasHeaders
          })),
          fileSize: stats.size
        }
      });
    } catch (error) {
      return this.createErrorResult(`Error procesando Excel: ${error.message}`, error);
    }
  }

  /**
   * Procesa una hoja individual del workbook
   */
  processSheet(sheet, sheetName, options) {
    // Obtener rango de la hoja
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const rowCount = Math.min(range.e.r - range.s.r + 1, options.maxRows);
    const columnCount = Math.min(range.e.c - range.s.c + 1, options.maxColumns);

    // Convertir a array de arrays
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false
    });

    // Limitar filas
    const limitedData = data.slice(0, options.maxRows);

    // Crear texto formateado como tabla
    const formattedText = this.formatAsTable(limitedData, options.includeHeaders);

    // Crear texto simple (valores separados por tabs y newlines)
    const simpleText = limitedData.map(row =>
      row.map(cell => this.formatCellValue(cell)).join('\t')
    ).join('\n');

    return {
      name: sheetName,
      rowCount: limitedData.length,
      columnCount,
      hasHeaders: options.includeHeaders && limitedData.length > 0,
      formattedText,
      text: simpleText,
      data: limitedData
    };
  }

  /**
   * Formatea los datos como una tabla legible
   */
  formatAsTable(data, includeHeaders) {
    if (!data || data.length === 0) {
      return '[Hoja vacia]';
    }

    // Calcular ancho de columnas
    const columnWidths = [];
    for (const row of data) {
      for (let i = 0; i < row.length; i++) {
        const cellValue = this.formatCellValue(row[i]);
        const length = Math.min(cellValue.length, 50); // Limite de 50 caracteres por celda
        columnWidths[i] = Math.max(columnWidths[i] || 0, length);
      }
    }

    // Formatear filas
    const lines = [];

    if (includeHeaders && data.length > 0) {
      // Primera fila como encabezado
      const headerRow = data[0].map((cell, i) =>
        this.formatCellValue(cell).padEnd(columnWidths[i])
      ).join(' | ');
      lines.push(headerRow);

      // Separador
      const separator = columnWidths.map(w => '-'.repeat(w)).join('-+-');
      lines.push(separator);

      // Resto de filas
      for (let r = 1; r < data.length; r++) {
        const row = data[r].map((cell, i) =>
          this.formatCellValue(cell).padEnd(columnWidths[i] || 0)
        ).join(' | ');
        lines.push(row);
      }
    } else {
      // Todas las filas normales
      for (const row of data) {
        const formattedRow = row.map((cell, i) =>
          this.formatCellValue(cell).padEnd(columnWidths[i] || 0)
        ).join(' | ');
        lines.push(formattedRow);
      }
    }

    return lines.join('\n');
  }

  /**
   * Formatea un valor de celda para mostrar
   */
  formatCellValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    if (value instanceof Date) {
      return value.toLocaleDateString('es-PE');
    }

    if (typeof value === 'number') {
      // Formatear numeros con 2 decimales si tienen decimales
      if (value % 1 !== 0) {
        return value.toFixed(2);
      }
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'Si' : 'No';
    }

    // Limitar longitud del texto
    const str = String(value).trim();
    if (str.length > 100) {
      return str.substring(0, 97) + '...';
    }

    return str;
  }
}

module.exports = ExcelParser;
