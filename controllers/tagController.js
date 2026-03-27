// =====================================================
// SISTEMA IRIS - Tag Controller
// Controlador para gestionar etiquetas
// =====================================================

const tagModel = require('../models/tagModel');
const asyncHandler = require('../utils/asyncHandler');

const tagController = {
  /**
   * Crear una nueva etiqueta
   * POST /api/tags
   */
  create: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { name, color } = req.body;

    const tag = await tagModel.createTag(userId, name, color);

    res.status(201).json({
      success: true,
      message: 'Etiqueta creada exitosamente',
      data: tag,
    });
  }),

  /**
   * Obtener todas las etiquetas del usuario
   * GET /api/tags
   */
  getAll: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const tags = await tagModel.getTagsByUser(userId);

    res.status(200).json({
      success: true,
      data: tags,
      total: tags.length,
    });
  }),

  /**
   * Obtener una etiqueta por ID
   * GET /api/tags/:id
   */
  getById: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de etiqueta invalido',
      });
    }

    const tag = await tagModel.getTagById(tagId, userId);

    res.status(200).json({
      success: true,
      data: tag,
    });
  }),

  /**
   * Actualizar una etiqueta
   * PUT /api/tags/:id
   */
  update: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);
    const { name, color } = req.body;

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de etiqueta invalido',
      });
    }

    const tag = await tagModel.updateTag(tagId, userId, { name, color });

    res.status(200).json({
      success: true,
      message: 'Etiqueta actualizada exitosamente',
      data: tag,
    });
  }),

  /**
   * Eliminar una etiqueta
   * DELETE /api/tags/:id
   */
  delete: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de etiqueta invalido',
      });
    }

    await tagModel.deleteTag(tagId, userId);

    res.status(200).json({
      success: true,
      message: 'Etiqueta eliminada exitosamente',
    });
  }),

  /**
   * Asignar una etiqueta a un caso
   * POST /api/tags/:id/case/:caseId
   */
  assignToCase: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);
    const caseId = parseInt(req.params.caseId, 10);

    if (isNaN(tagId) || isNaN(caseId)) {
      return res.status(400).json({
        success: false,
        message: 'IDs invalidos',
      });
    }

    const result = await tagModel.assignTagToCase(tagId, caseId, userId);

    res.status(201).json({
      success: true,
      message: 'Etiqueta asignada al caso exitosamente',
      data: result,
    });
  }),

  /**
   * Asignar una etiqueta a una evidencia
   * POST /api/tags/:id/evidence/:evidenceId
   */
  assignToEvidence: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);
    const evidenceId = parseInt(req.params.evidenceId, 10);

    if (isNaN(tagId) || isNaN(evidenceId)) {
      return res.status(400).json({
        success: false,
        message: 'IDs invalidos',
      });
    }

    const result = await tagModel.assignTagToEvidence(tagId, evidenceId, userId);

    res.status(201).json({
      success: true,
      message: 'Etiqueta asignada a la evidencia exitosamente',
      data: result,
    });
  }),

  /**
   * Remover una etiqueta de un caso
   * DELETE /api/tags/:id/case/:caseId
   */
  removeFromCase: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);
    const caseId = parseInt(req.params.caseId, 10);

    if (isNaN(tagId) || isNaN(caseId)) {
      return res.status(400).json({
        success: false,
        message: 'IDs invalidos',
      });
    }

    await tagModel.removeTagFromCase(tagId, caseId, userId);

    res.status(200).json({
      success: true,
      message: 'Etiqueta removida del caso exitosamente',
    });
  }),

  /**
   * Remover una etiqueta de una evidencia
   * DELETE /api/tags/:id/evidence/:evidenceId
   */
  removeFromEvidence: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);
    const evidenceId = parseInt(req.params.evidenceId, 10);

    if (isNaN(tagId) || isNaN(evidenceId)) {
      return res.status(400).json({
        success: false,
        message: 'IDs invalidos',
      });
    }

    await tagModel.removeTagFromEvidence(tagId, evidenceId, userId);

    res.status(200).json({
      success: true,
      message: 'Etiqueta removida de la evidencia exitosamente',
    });
  }),

  /**
   * Obtener casos por etiqueta
   * GET /api/tags/:id/cases
   */
  getCasesByTag: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de etiqueta invalido',
      });
    }

    const cases = await tagModel.getCasesByTag(tagId, userId);

    res.status(200).json({
      success: true,
      data: cases,
      total: cases.length,
    });
  }),

  /**
   * Obtener evidencias por etiqueta
   * GET /api/tags/:id/evidences
   */
  getEvidencesByTag: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const tagId = parseInt(req.params.id, 10);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de etiqueta invalido',
      });
    }

    const evidences = await tagModel.getEvidencesByTag(tagId, userId);

    res.status(200).json({
      success: true,
      data: evidences,
      total: evidences.length,
    });
  }),
};

module.exports = tagController;
