/**
 * TextCleaner - Utilidades para limpiar y normalizar texto extraido
 */

class TextCleaner {
  /**
   * Limpia y normaliza texto extraido de documentos
   * @param {string} text - Texto a limpiar
   * @param {Object} options - Opciones de limpieza
   * @returns {string} Texto limpio
   */
  static clean(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    const {
      removeExtraWhitespace = true,
      removeEmptyLines = true,
      normalizeLineBreaks = true,
      trimLines = true,
      removeControlChars = true,
      normalizeQuotes = true,
      maxConsecutiveNewlines = 2
    } = options;

    let cleaned = text;

    // Remover caracteres de control (excepto newlines y tabs)
    if (removeControlChars) {
      cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    // Normalizar saltos de linea
    if (normalizeLineBreaks) {
      cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // Normalizar comillas
    if (normalizeQuotes) {
      cleaned = cleaned
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/[«»]/g, '"');
    }

    // Remover espacios multiples
    if (removeExtraWhitespace) {
      cleaned = cleaned.replace(/[ \t]+/g, ' ');
    }

    // Trim cada linea
    if (trimLines) {
      cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
    }

    // Remover lineas vacias multiples
    if (removeEmptyLines) {
      const regex = new RegExp(`\\n{${maxConsecutiveNewlines + 1},}`, 'g');
      cleaned = cleaned.replace(regex, '\n'.repeat(maxConsecutiveNewlines));
    }

    return cleaned.trim();
  }

  /**
   * Normaliza texto para comparacion (lowercase, sin acentos, etc)
   * @param {string} text - Texto a normalizar
   * @returns {string} Texto normalizado
   */
  static normalize(text) {
    if (!text) return '';

    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^\w\s]/g, ' ') // Remover puntuacion
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extrae oraciones de un texto
   * @param {string} text - Texto fuente
   * @returns {string[]} Array de oraciones
   */
  static extractSentences(text) {
    if (!text) return [];

    // Patron para detectar fin de oracion
    const sentencePattern = /[^.!?]+[.!?]+(?:\s|$)/g;
    const sentences = text.match(sentencePattern) || [];

    return sentences.map(s => s.trim()).filter(s => s.length > 10);
  }

  /**
   * Extrae parrafos de un texto
   * @param {string} text - Texto fuente
   * @returns {string[]} Array de parrafos
   */
  static extractParagraphs(text) {
    if (!text) return [];

    return text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  /**
   * Detecta el idioma predominante del texto
   * @param {string} text - Texto a analizar
   * @returns {string} Codigo de idioma (es, en, etc)
   */
  static detectLanguage(text) {
    if (!text || text.length < 50) {
      return 'unknown';
    }

    const sample = text.substring(0, 1000).toLowerCase();

    // Palabras comunes en espanol
    const spanishWords = ['de', 'la', 'el', 'en', 'que', 'los', 'del', 'las', 'por', 'con', 'una', 'para', 'es', 'se', 'al', 'como', 'mas', 'pero', 'sus', 'le', 'ya', 'muy', 'sin', 'sobre', 'entre', 'cuando', 'todo', 'esta', 'ser', 'son', 'dos', 'tambien', 'fue', 'habia', 'era', 'muy', 'ano', 'hasta', 'desde', 'puede', 'puede'];

    // Palabras comunes en ingles
    const englishWords = ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what'];

    // Contar ocurrencias
    const words = sample.split(/\s+/);
    let spanishCount = 0;
    let englishCount = 0;

    for (const word of words) {
      if (spanishWords.includes(word)) spanishCount++;
      if (englishWords.includes(word)) englishCount++;
    }

    if (spanishCount > englishCount * 1.5) {
      return 'es';
    } else if (englishCount > spanishCount * 1.5) {
      return 'en';
    }

    return 'unknown';
  }

  /**
   * Trunca texto a un numero maximo de caracteres preservando palabras completas
   * @param {string} text - Texto a truncar
   * @param {number} maxLength - Longitud maxima
   * @param {string} suffix - Sufijo a agregar si se trunca
   * @returns {string} Texto truncado
   */
  static truncate(text, maxLength = 1000, suffix = '...') {
    if (!text || text.length <= maxLength) {
      return text || '';
    }

    // Encontrar el ultimo espacio antes del limite
    let truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.8) {
      truncated = truncated.substring(0, lastSpace);
    }

    return truncated + suffix;
  }

  /**
   * Cuenta palabras en un texto
   * @param {string} text - Texto a contar
   * @returns {number} Numero de palabras
   */
  static countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Extrae numeros de un texto
   * @param {string} text - Texto fuente
   * @returns {number[]} Array de numeros encontrados
   */
  static extractNumbers(text) {
    if (!text) return [];

    const matches = text.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g) || [];
    return matches.map(n => parseFloat(n.replace(/,/g, '')));
  }

  /**
   * Extrae fechas de un texto
   * @param {string} text - Texto fuente
   * @returns {string[]} Array de fechas encontradas
   */
  static extractDates(text) {
    if (!text) return [];

    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g, // DD/MM/YYYY
      /\d{1,2}-\d{1,2}-\d{2,4}/g, // DD-MM-YYYY
      /\d{4}-\d{2}-\d{2}/g, // YYYY-MM-DD
      /\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/gi // DD de Mes de YYYY
    ];

    const dates = new Set();
    for (const pattern of datePatterns) {
      const matches = text.match(pattern) || [];
      matches.forEach(m => dates.add(m));
    }

    return Array.from(dates);
  }

  /**
   * Extrae emails de un texto
   * @param {string} text - Texto fuente
   * @returns {string[]} Array de emails encontrados
   */
  static extractEmails(text) {
    if (!text) return [];

    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailPattern) || [];
    return [...new Set(matches)];
  }

  /**
   * Extrae URLs de un texto
   * @param {string} text - Texto fuente
   * @returns {string[]} Array de URLs encontradas
   */
  static extractUrls(text) {
    if (!text) return [];

    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const matches = text.match(urlPattern) || [];
    return [...new Set(matches)];
  }

  /**
   * Resalta terminos de busqueda en un texto
   * @param {string} text - Texto fuente
   * @param {string[]} terms - Terminos a resaltar
   * @param {string} prefix - Prefijo de resaltado
   * @param {string} suffix - Sufijo de resaltado
   * @returns {string} Texto con terminos resaltados
   */
  static highlight(text, terms, prefix = '**', suffix = '**') {
    if (!text || !terms || terms.length === 0) {
      return text || '';
    }

    let result = text;
    for (const term of terms) {
      if (!term) continue;
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(regex, `${prefix}$1${suffix}`);
    }

    return result;
  }
}

module.exports = TextCleaner;
