// =====================================================
// SISTEMA IRIS - Token Manager
// Estimacion de tokens y control de limites para OpenAI
// =====================================================

const { TOKEN_LIMITS, MAX_INPUT_TOKENS } = require('./constants');

/**
 * Estima tokens para un texto dado (~4 chars por token)
 */
function estimateTextTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / TOKEN_LIMITS.CHARS_PER_TOKEN);
}

/**
 * Prepara contenido (texto + imagenes) para no exceder el context window.
 * Si el total excede el limite: primero limita imagenes (max 40% del budget),
 * luego trunca texto.
 *
 * @param {string} mainText - Texto principal (se truncara si excede)
 * @param {Array} images - Imagenes [{base64, mimeType, ...}]
 * @param {Object} options
 * @param {number} options.otherTextTokens - Tokens estimados de variables adicionales
 * @returns {{ text: string, images: Array, truncated: boolean, imagesLimited: boolean }}
 */
function prepareContentForAI(mainText, images = [], options = {}) {
  const { otherTextTokens = 0 } = options;
  const available = MAX_INPUT_TOKENS - otherTextTokens;

  let text = mainText || '';
  let imgs = [...images];
  let truncated = false;
  let imagesLimited = false;

  const imgTokens = imgs.length * TOKEN_LIMITS.TOKENS_PER_IMAGE;
  const txtTokens = estimateTextTokens(text);

  if (txtTokens + imgTokens <= available) {
    return { text, images: imgs, truncated, imagesLimited };
  }

  // 1. Limitar imagenes si usan mas del 40% del budget
  let adjustedImgTokens = imgTokens;
  if (imgTokens > available * 0.4 && imgs.length > 1) {
    const maxImgs = Math.max(1, Math.floor((available * 0.4) / TOKEN_LIMITS.TOKENS_PER_IMAGE));
    if (maxImgs < imgs.length) {
      console.log(`[tokenManager] Imagenes limitadas: ${imgs.length} -> ${maxImgs}`);
      imgs = imgs.slice(0, maxImgs);
      imagesLimited = true;
      adjustedImgTokens = imgs.length * TOKEN_LIMITS.TOKENS_PER_IMAGE;
    }
  }

  // 2. Truncar texto si excede lo restante
  const availForText = available - adjustedImgTokens;
  if (estimateTextTokens(text) > availForText && availForText > 0) {
    const maxChars = Math.floor(availForText * TOKEN_LIMITS.CHARS_PER_TOKEN);
    if (maxChars > 0 && maxChars < text.length) {
      console.log(`[tokenManager] Texto truncado: ${text.length} -> ${maxChars} chars`);
      text = text.substring(0, maxChars) + '\n\n[... contenido truncado por limite de contexto ...]';
      truncated = true;
    }
  }

  return { text, images: imgs, truncated, imagesLimited };
}

module.exports = {
  estimateTextTokens,
  prepareContentForAI
};
