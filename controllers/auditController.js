// =====================================================
// SISTEMA IRIS - Audit Controller
// Controlador para gestion de logs de auditoria
// Solo accesible por SUPER_ADMIN
// =====================================================

const auditModel = require('../models/auditModel');
const asyncHandler = require('../utils/asyncHandler');
const PDFDocument = require('pdfkit');

const auditController = {
  /**
   * Obtener todos los logs de auditoria con filtros
   * GET /api/audit
   * Solo SUPER_ADMIN
   */
  getAll: asyncHandler(async (req, res) => {
    const filters = {
      page: req.query.page || 1,
      limit: req.query.limit || 50,
      actionCode: req.query.actionCode,
      entityType: req.query.entityType,
      entityId: req.query.entityId,
      actorUserId: req.query.actorUserId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
    };

    const result = await auditModel.getAuditLogs(filters);

    res.status(200).json({
      success: true,
      ...result,
    });
  }),

  /**
   * Obtener un log de auditoria por ID
   * GET /api/audit/:id
   * Solo SUPER_ADMIN
   */
  getById: asyncHandler(async (req, res) => {
    const logId = parseInt(req.params.id, 10);

    if (isNaN(logId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de log invalido',
      });
    }

    const log = await auditModel.getAuditLogById(logId);

    res.status(200).json({
      success: true,
      data: log,
    });
  }),

  /**
   * Exportar logs de auditoria
   * GET /api/audit/export
   * Solo SUPER_ADMIN
   */
  export: asyncHandler(async (req, res) => {
    const format = req.query.format || 'csv';
    const filters = {
      actionCode: req.query.actionCode,
      entityType: req.query.entityType,
      actorUserId: req.query.actorUserId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    if (format === 'csv') {
      const result = await auditModel.exportAuditLogs(filters, 'csv');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send('\uFEFF' + result.content); // BOM para UTF-8 en Excel
    } else if (format === 'pdf') {
      const result = await auditModel.exportAuditLogs(filters, 'pdf');

      // Generar PDF
      const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

      doc.pipe(res);

      // Titulo
      doc.fontSize(18).text(result.title, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generado: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });
      doc.fontSize(10).text(`Total de registros: ${result.totalRecords}`, { align: 'center' });
      doc.moveDown(2);

      // Encabezados de tabla
      const tableHeaders = ['Fecha', 'Usuario', 'Accion', 'Entidad', 'ID', 'IP'];
      const colWidths = [120, 120, 150, 100, 60, 100];
      let xPos = 50;
      const startY = doc.y;

      doc.fontSize(9).font('Helvetica-Bold');
      tableHeaders.forEach((header, i) => {
        doc.text(header, xPos, startY, { width: colWidths[i], align: 'left' });
        xPos += colWidths[i];
      });

      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(750, doc.y).stroke();
      doc.moveDown(0.5);

      // Datos
      doc.font('Helvetica').fontSize(8);
      let rowCount = 0;
      const maxRows = 30; // Filas por pagina

      for (const log of result.data) {
        if (rowCount >= maxRows) {
          doc.addPage({ layout: 'landscape' });
          rowCount = 0;
          doc.y = 50;
        }

        xPos = 50;
        const rowY = doc.y;
        const fecha = new Date(log.fecha).toLocaleString('es-ES', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        const rowData = [
          fecha,
          log.usuario.substring(0, 20),
          log.accion.substring(0, 25),
          (log.tipoEntidad || 'N/A').substring(0, 15),
          String(log.idEntidad || 'N/A'),
          log.ip || 'N/A',
        ];

        rowData.forEach((cell, i) => {
          doc.text(cell, xPos, rowY, { width: colWidths[i], align: 'left' });
          xPos += colWidths[i];
        });

        doc.moveDown();
        rowCount++;
      }

      // Pie de pagina
      doc.moveDown(2);
      doc.fontSize(8).text('Sistema IRIS - Reporte de Auditoria', { align: 'center' });

      doc.end();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Formato de exportacion no soportado. Use csv o pdf',
      });
    }
  }),

  /**
   * Obtener estadisticas de auditoria
   * GET /api/audit/stats
   * Solo SUPER_ADMIN
   */
  getStats: asyncHandler(async (req, res) => {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const stats = await auditModel.getAuditStats(filters);

    res.status(200).json({
      success: true,
      data: stats,
    });
  }),

  /**
   * Obtener filtros disponibles
   * GET /api/audit/filters
   * Solo SUPER_ADMIN
   */
  getFilters: asyncHandler(async (req, res) => {
    const [actions, entityTypes] = await Promise.all([
      auditModel.getAvailableActions(),
      auditModel.getAvailableEntityTypes(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        actions,
        entityTypes,
      },
    });
  }),
};

module.exports = auditController;
