// =====================================================
// SISTEMA IRIS - AI Service (Facade minima)
// Solo re-exporta continueConversation para el chat
// Toda la logica IA fue migrada a services/analysis/
// =====================================================

const { continueConversation } = require('./analysis/shared/baseAIClient');

module.exports = { continueConversation };
