// =====================================================
// SISTEMA IRIS - Usage Tracker
// Persiste consumo de tokens por usuario por llamada IA
// =====================================================

const prisma = require('../../../config/prisma');

// Precios por modelo (USD por 1M tokens)
const MODEL_PRICING = {
  'gpt-4o':       { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':  { input: 0.15,  output: 0.60 },
  'gpt-4.1':      { input: 2.00,  output: 8.00 },
  'gpt-4.1-mini': { input: 0.40,  output: 1.60 },
  'gpt-4.1-nano': { input: 0.10,  output: 0.40 },
  'o4-mini':      { input: 1.10,  output: 4.40 },
};

const WHISPER_COST_PER_MINUTE = 0.006;

/**
 * Calcula costo estimado dado tokens y modelo
 */
function estimateCost(inputTokens, outputTokens, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return parseFloat((inputCost + outputCost).toFixed(6));
}

/**
 * Registra consumo de tokens de una llamada IA
 * @param {Object} params
 * @param {number} params.userId
 * @param {string} params.serviceType - TRANSLATE|RECOMMEND|COMPARE|OBJECTIONS|CHAT|WHISPER
 * @param {number} [params.requestId]
 * @param {number} [params.caseId]
 * @param {Object} [params.usage] - { input_tokens, output_tokens, total_tokens }
 * @param {string} [params.model]
 * @param {string} [params.provider]
 * @param {string} [params.callType] - 'primary'|'followup_chat'|'transcription'
 * @param {number} [params.audioDurationSeconds]
 */
async function recordUsage(params) {
  try {
    const {
      userId,
      serviceType,
      requestId = null,
      caseId = null,
      usage = null,
      model = 'unknown',
      provider = 'openai',
      callType = 'primary',
      audioDurationSeconds = null
    } = params;

    const inputTokens = usage?.input_tokens || 0;
    const outputTokens = usage?.output_tokens || 0;
    const totalTokens = usage?.total_tokens || (inputTokens + outputTokens);

    let cost;
    if (callType === 'transcription' && audioDurationSeconds) {
      cost = parseFloat(((audioDurationSeconds / 60) * WHISPER_COST_PER_MINUTE).toFixed(6));
    } else {
      cost = estimateCost(inputTokens, outputTokens, model);
    }

    // Insertar en token_usage
    await prisma.tokenUsage.create({
      data: {
        userId,
        serviceType,
        requestId,
        caseId,
        inputTokens,
        outputTokens,
        totalTokens,
        aiModel: model,
        aiProvider: provider,
        estimatedCost: cost,
        audioDurationSeconds: audioDurationSeconds ? parseFloat(audioDurationSeconds.toFixed(2)) : null,
        callType
      }
    });

    // Actualizar totales en analysis_requests (si aplica)
    if (requestId) {
      await prisma.analysisRequest.update({
        where: { id: requestId },
        data: {
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
          totalTokens: { increment: totalTokens },
          estimatedCost: { increment: cost }
        }
      });
    }

    console.log(`[usageTracker] ${serviceType}/${callType}: ${totalTokens} tokens, $${cost} (user ${userId})`);
  } catch (error) {
    console.error(`[usageTracker] Error registrando usage: ${error.message}`);
  }
}

module.exports = { recordUsage, estimateCost, MODEL_PRICING, WHISPER_COST_PER_MINUTE };
