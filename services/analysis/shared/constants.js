// =====================================================
// SISTEMA IRIS - Constantes de Analisis IA
// Fuente canonica para pipelines de servicio
// =====================================================

const { DISCLAIMER } = require('../../../utils/constants');

// Modelo usado para llamadas con imagenes (Vision API)
const VISION_MODEL = 'gpt-4o';

// GPT-4o: 128K context window
const TOKEN_LIMITS = {
  CHARS_PER_TOKEN: 4,
  TOKENS_PER_IMAGE: 1000,
  MAX_CONTEXT: 128000,
  RESERVED_OUTPUT: 16384,
  RESERVED_PROMPT: 8000
};

const MAX_INPUT_TOKENS = TOKEN_LIMITS.MAX_CONTEXT - TOKEN_LIMITS.RESERVED_OUTPUT - TOKEN_LIMITS.RESERVED_PROMPT;

// System prompts para funcion de chat (continuacion de conversacion)
const CHAT_SYSTEM_PROMPTS = {
  TRANSLATE: 'Eres un experto en traducir informes periciales tecnicos a lenguaje comun. El usuario te hara preguntas de seguimiento sobre el analisis previo. Responde de manera clara y accesible.',
  RECOMMEND: 'Eres un experto legal en recomendar peritos especializados. El usuario te hara preguntas de seguimiento sobre las recomendaciones de peritos. Proporciona respuestas detalladas.',
  COMPARE: 'Eres un experto en analisis comparativo de peritajes. El usuario te hara preguntas sobre la comparacion realizada. Explica las diferencias y similitudes con claridad.',
  OBJECTIONS: 'Eres un experto legal en objeciones tecnicas a peritajes. El usuario te hara preguntas sobre las objeciones generadas. Detalla los fundamentos legales y tecnicos.'
};

const CHAT_DEFAULT_SYSTEM_PROMPT = 'Eres un asistente experto en analisis de evidencias legales. Responde las preguntas del usuario de manera clara y profesional.';

// Maximo de caracteres del resultado original enviados al chat de seguimiento
const CHAT_CONTEXT_MAX_CHARS = 25000;

module.exports = {
  TOKEN_LIMITS,
  MAX_INPUT_TOKENS,
  DISCLAIMER,
  VISION_MODEL,
  CHAT_SYSTEM_PROMPTS,
  CHAT_DEFAULT_SYSTEM_PROMPT,
  CHAT_CONTEXT_MAX_CHARS
};
