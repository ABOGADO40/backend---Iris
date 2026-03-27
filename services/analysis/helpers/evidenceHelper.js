// =====================================================
// SISTEMA IRIS - Evidence Helper
// Funciones de procesamiento de evidencias para pipelines IA
// Extraidas de analysisController.js
// =====================================================

const prisma = require('../../../config/prisma');
const { documentProcessor } = require('../../documentProcessor');
const evidenceModel = require('../../../models/evidenceModel');
const caseModel = require('../../../models/caseModel');
const { saveEvidenceFile, getLocalPathForReading } = require('../../../utils/caseFileHelper');
const { recordUsage } = require('../shared/usageTracker');

/**
 * Detecta si un archivo es de audio o video basado en su extension o MIME type
 * @param {string} filename - Nombre del archivo
 * @param {string} mimeType - MIME type del archivo
 * @returns {{isAudio: boolean, isVideo: boolean}}
 */
function detectMediaType(filename, mimeType) {
  const ext = filename ? filename.toLowerCase().split('.').pop() : '';

  const audioExtensions = ['mp3', 'wav', 'm4a', 'ogg', 'opus', 'flac', 'aac', 'wma', 'webm'];
  const videoExtensions = ['mp4', 'avi', 'mkv', 'mov', 'webm', 'wmv', 'flv', 'm4v', 'mpeg', 'mpg'];

  const isAudio = audioExtensions.includes(ext) || (mimeType && mimeType.startsWith('audio/'));
  const isVideo = videoExtensions.includes(ext) || (mimeType && mimeType.startsWith('video/'));

  return { isAudio, isVideo };
}

/**
 * Obtiene el contenido de una evidencia
 * Procesa automaticamente archivos PDF, Word, Excel, imagenes, audio y video
 */
async function getEvidenceContent(evidenceId, userId, options = {}) {
  const { enableOCR = true, processFile = true, serviceType, caseId: optionsCaseId } = options;

  const evidence = await prisma.evidence.findFirst({
    where: {
      id: evidenceId,
      ...(userId && { ownerUserId: userId }),
    },
    include: {
      evidenceText: true,
      evidenceFile: {
        include: {
          transcription: true
        }
      }
    }
  });

  if (!evidence) {
    return null;
  }

  // Si hay texto almacenado en evidenceText, usarlo como contenido principal.
  // PERO si tambien tiene archivo, procesarlo para extraer imagenes (no perder informacion visual).
  if (evidence.evidenceText?.textContent) {
    const textContent = evidence.evidenceText.textContent;

    // Si tambien tiene archivo, procesarlo SOLO para extraer imagenes
    if (evidence.evidenceFile && processFile) {
      const filePath = evidence.evidenceFile.storagePath;
      const filename = evidence.evidenceFile.originalFilename;
      const mimeType = evidence.evidenceFile.mimeType;
      const { isAudio, isVideo } = detectMediaType(filename, mimeType);

      // Solo procesar para imagenes si NO es audio/video (audio/video no tiene imagenes relevantes)
      if (!isAudio && !isVideo) {
        try {
          const absoluteFilePath = await getLocalPathForReading(filePath);
          if (absoluteFilePath && documentProcessor.isSupported(absoluteFilePath)) {
            console.log(`[evidenceHelper] Procesando archivo para imagenes (texto de evidenceText): ${absoluteFilePath}`);
            const processResult = await documentProcessor.process(absoluteFilePath, { enableOCR, serviceType });
            if (processResult.success && processResult.images?.length > 0) {
              console.log(`[evidenceHelper] ${processResult.images.length} imagen(es) extraidas del archivo: ${filename}`);
              return {
                evidence,
                content: textContent,
                type: evidence.evidenceType,
                images: processResult.images,
                audioText: [],
                frames: [],
                isFile: true,
                filename,
                localFilePath: absoluteFilePath
              };
            }
          }
        } catch (err) {
          console.warn(`[evidenceHelper] Error extrayendo imagenes de ${filename}: ${err.message}`);
        }
      }
    }

    // Texto puro sin imagenes (no tiene archivo, o el archivo no tenia imagenes)
    return {
      evidence,
      content: textContent,
      type: evidence.evidenceType,
      images: [],
      audioText: [],
      frames: []
    };
  }

  // Si es archivo, procesar automaticamente
  if (evidence.evidenceFile && processFile) {
    const filePath = evidence.evidenceFile.storagePath;
    const mimeType = evidence.evidenceFile.mimeType;
    const filename = evidence.evidenceFile.originalFilename;

    // Detectar si es audio o video
    const { isAudio, isVideo } = detectMediaType(filename, mimeType);

    // Si ya existe una transcripcion completada, usarla
    if ((isAudio || isVideo) && evidence.evidenceFile.transcription) {
      const transcription = evidence.evidenceFile.transcription;
      if (transcription.processingStatus === 'COMPLETED' && transcription.transcriptionText) {
        console.log(`[evidenceHelper] Usando transcripcion existente para: ${filename}`);
        return {
          evidence,
          content: transcription.transcriptionText,
          type: evidence.evidenceType,
          isFile: true,
          isAudioVideo: true,
          filename: filename,
          images: [],
          audioText: [transcription.transcriptionText],
          frames: [],
          metadata: {
            duration: transcription.durationSeconds,
            language: transcription.transcriptionLanguage,
            hasTimestamps: transcription.hasTimestamps,
            timestamps: transcription.timestampsJson
          },
          processed: true,
          requiresTranscription: false
        };
      }
    }

    // Obtener ruta local para procesamiento (descarga de S3 si es necesario)
    const absoluteFilePath = await getLocalPathForReading(filePath);

    // Verificar que el archivo existe fisicamente y es soportado
    if (absoluteFilePath && documentProcessor.isSupported(absoluteFilePath)) {
      try {
        console.log(`[evidenceHelper] Procesando archivo: ${absoluteFilePath} (servicio: ${serviceType})`);
        const processResult = await documentProcessor.process(absoluteFilePath, { enableOCR, serviceType });

        if (processResult.success) {
          // Si es audio/video, guardar la transcripcion en la BD
          if ((isAudio || isVideo) && processResult.metadata?.requiresTranscription) {
            try {
              await prisma.transcription.upsert({
                where: { evidenceFileId: evidence.evidenceFile.id },
                update: {
                  transcriptionText: processResult.text,
                  transcriptionLanguage: processResult.metadata?.language || 'auto',
                  durationSeconds: Math.round(processResult.metadata?.duration || 0),
                  processingStatus: 'COMPLETED',
                  hasTimestamps: processResult.metadata?.hasTimestamps || false,
                  timestampsJson: processResult.metadata?.timestamps || null,
                  costUsd: processResult.metadata?.cost || null,
                  userIdModification: userId,
                  dateTimeModification: new Date()
                },
                create: {
                  evidenceFileId: evidence.evidenceFile.id,
                  transcriptionText: processResult.text,
                  transcriptionLanguage: processResult.metadata?.language || 'auto',
                  durationSeconds: Math.round(processResult.metadata?.duration || 0),
                  processingStatus: 'COMPLETED',
                  whisperModel: processResult.metadata?.model || 'whisper-1',
                  hasTimestamps: processResult.metadata?.hasTimestamps || false,
                  timestampsJson: processResult.metadata?.timestamps || null,
                  costUsd: processResult.metadata?.cost || null,
                  userIdRegistration: userId
                }
              });
              console.log(`[evidenceHelper] Transcripcion guardada para: ${filename}`);
              // Registrar costo Whisper
              if (processResult.metadata?.duration) {
                recordUsage({
                  userId: userId || 0,
                  serviceType: 'WHISPER',
                  requestId: null,
                  caseId: optionsCaseId || null,
                  usage: null,
                  model: processResult.metadata?.model || 'whisper-1',
                  callType: 'transcription',
                  audioDurationSeconds: processResult.metadata.duration
                });
              }
            } catch (saveError) {
              console.warn(`[evidenceHelper] Error guardando transcripcion: ${saveError.message}`);
            }
          }

          return {
            evidence,
            content: processResult.text,
            type: evidence.evidenceType,
            isFile: true,
            isAudioVideo: isAudio || isVideo,
            filename: filename,
            images: processResult.images || [],
            audioText: processResult.audioText || [],
            frames: processResult.frames || [],
            metadata: processResult.metadata,
            processed: true,
            renderWarning: processResult.metadata?.renderWarning || null,
            requiresTranscription: processResult.metadata?.requiresTranscription || false,
            localFilePath: absoluteFilePath
          };
        } else {
          const errorMsg = processResult.error?.message || 'Error desconocido';
          console.warn(`[evidenceHelper] Error procesando archivo: ${errorMsg}`);

          // Si es audio/video y fallo, marcar el error
          if (isAudio || isVideo) {
            try {
              await prisma.transcription.upsert({
                where: { evidenceFileId: evidence.evidenceFile.id },
                update: {
                  processingStatus: 'FAILED',
                  errorMessage: errorMsg,
                  userIdModification: userId,
                  dateTimeModification: new Date()
                },
                create: {
                  evidenceFileId: evidence.evidenceFile.id,
                  processingStatus: 'FAILED',
                  errorMessage: errorMsg,
                  userIdRegistration: userId
                }
              });
            } catch (saveError) {
              // Ignorar error de guardado
            }
          }

          // Retornar con error explicito para que el orchestrator pueda reportarlo
          return {
            evidence,
            content: null,
            type: evidence.evidenceType,
            isFile: true,
            isAudioVideo: isAudio || isVideo,
            filename: filename,
            images: [],
            audioText: [],
            frames: [],
            processed: false,
            processingError: isAudio || isVideo
              ? `No se pudo transcribir el archivo "${filename}": ${errorMsg}`
              : `No se pudo procesar el archivo "${filename}": ${errorMsg}`,
            requiresTranscription: isAudio || isVideo
          };
        }
      } catch (processError) {
        console.error(`[evidenceHelper] Error en procesamiento: ${processError.message}`);
      }
    }

    // Si no se pudo procesar, retornar info del archivo con error explicito
    return {
      evidence,
      content: null,
      type: evidence.evidenceType,
      isFile: true,
      isAudioVideo: isAudio || isVideo,
      filename: filename,
      images: [],
      audioText: [],
      frames: [],
      processed: false,
      processingError: `No se pudo procesar el archivo "${filename}". ${isAudio || isVideo ? 'Verifique que el formato de audio/video sea compatible.' : 'El archivo no es accesible o su formato no es soportado.'}`,
      requiresTranscription: isAudio || isVideo
    };
  }

  return { evidence, content: null, type: evidence.evidenceType, images: [], audioText: [], frames: [] };
}

/**
 * Obtiene el contexto completo de un caso para servicios IA
 * @param {number} caseId - ID del caso
 * @param {number} userId - ID del usuario (null para SUPER_ADMIN)
 * @param {number[]} evidenceIds - IDs de evidencias a incluir
 * @param {string} serviceType - Tipo de servicio IA que origina la peticion
 * @returns {Object} { caseData, caseDescription, evidenceContents[], allImages[] }
 */
async function getCaseContext(caseId, userId, evidenceIds = [], serviceType = null) {
  const caseData = await prisma.case.findFirst({
    where: {
      id: caseId,
      status: 'ACTIVE',
      ...(userId && { ownerUserId: userId }),
    },
    include: {
      caseEvidences: {
        include: {
          evidence: {
            select: { id: true, title: true, evidenceType: true, tipoEvidencia: true, notes: true }
          }
        }
      }
    }
  });

  if (!caseData) {
    return null;
  }

  // Procesar la descripcion del caso
  let caseDescription = '';
  let caseDescImages = [];
  let caseDescLocalPath = null;

  if (caseData.descriptionFilePath) {
    try {
      const absolutePath = await getLocalPathForReading(caseData.descriptionFilePath);
      if (absolutePath) {
        caseDescLocalPath = absolutePath;
        const processResult = await documentProcessor.process(absolutePath, { enableOCR: true, serviceType });
        if (processResult.success) {
          caseDescription = processResult.text || '';
          if (processResult.images?.length > 0) caseDescImages = processResult.images;
        }
      } else {
        console.warn(`[evidenceHelper] Archivo de descripcion no encontrado: ${caseData.descriptionFilePath}`);
      }
    } catch (err) {
      console.warn(`[evidenceHelper] Error procesando archivo de descripcion: ${err.message}`);
    }
  }
  if (caseData.description) {
    caseDescription = caseDescription
      ? caseDescription + '\n\n' + caseData.description
      : caseData.description;
  }

  // Validar que los evidenceIds solicitados pertenecen al caso
  const caseEvidenceIds = caseData.caseEvidences.map(ce => ce.evidence.id);
  const validEvidenceIds = evidenceIds.filter(id => caseEvidenceIds.includes(id));

  // Procesar cada evidencia seleccionada
  const evidenceContents = [];

  for (const evId of validEvidenceIds) {
    const evContent = await getEvidenceContent(evId, userId, { enableOCR: true, serviceType, caseId });
    if (evContent) {
      evidenceContents.push({
        evidenceId: evId,
        title: evContent.evidence?.title || `Evidencia ${evId}`,
        type: evContent.type,
        content: evContent.content || '',
        images: evContent.images || [],
        audioText: evContent.audioText || [],
        frames: evContent.frames || [],
        filename: evContent.filename,
        isAudioVideo: evContent.isAudioVideo || false,
        processingError: evContent.processingError || null,
        renderWarning: evContent.renderWarning || null,
        localFilePath: evContent.localFilePath || null
      });
    }
  }

  return { caseData, caseDescription, caseDescImages, caseDescLocalPath, evidenceContents };
}

/**
 * Crea una evidencia a partir de un archivo subido en un servicio IA
 * @param {Object} file - Objeto de archivo de multer
 * @param {number} caseId - ID del caso
 * @param {number} userId - ID del usuario
 * @param {string} serviceType - Tipo de servicio IA
 * @returns {Object} { evidenceId, content, images }
 */
async function createEvidenceFromUpload(file, caseId, userId, serviceType = null) {
  // 1. Crear registro de evidencia
  const evidence = await evidenceModel.createEvidence(userId, {
    evidenceType: 'FILE',
    title: file.originalname,
    tipoEvidencia: file.mimetype,
    notes: 'Creada automaticamente desde servicio IA'
  });

  // 2. Mover archivo a carpeta del caso (S3 o local)
  const relativePath = await saveEvidenceFile(file.path, caseId, evidence.id, file.originalname);

  // 3. Crear registro en evidence_files
  await evidenceModel.createEvidenceFile(evidence.id, {
    originalFilename: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: BigInt(file.size),
    storagePath: relativePath
  }, userId);

  // 4. Vincular al caso
  await caseModel.attachEvidence(caseId, evidence.id, userId);

  // 5. Procesar el archivo para obtener contenido
  const evContent = await getEvidenceContent(evidence.id, userId, { enableOCR: true, serviceType, caseId });

  return {
    evidenceId: evidence.id,
    content: evContent?.content || '',
    images: evContent?.images || [],
    audioText: evContent?.audioText || [],
    frames: evContent?.frames || [],
    title: file.originalname,
    isAudioVideo: evContent?.isAudioVideo || false,
    localFilePath: evContent?.localFilePath || null
  };
}

module.exports = {
  detectMediaType,
  getEvidenceContent,
  getCaseContext,
  createEvidenceFromUpload
};
