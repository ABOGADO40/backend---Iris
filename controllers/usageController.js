// =====================================================
// SISTEMA IRIS - Usage Controller
// Endpoints para consultar consumo de tokens
// =====================================================

const usageModel = require('../models/usageModel');

async function getMyUsage(req, res) {
  try {
    const { from, to } = req.query;
    const result = await usageModel.getMyUsageSummary(req.user.id, from, to);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error en getMyUsage:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo consumo' });
  }
}

async function getMyUsageByDay(req, res) {
  try {
    const { from, to } = req.query;
    const result = await usageModel.getMyUsageByDay(req.user.id, from, to);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error en getMyUsageByDay:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo consumo por dia' });
  }
}

async function getMyUsageByCase(req, res) {
  try {
    const result = await usageModel.getMyUsageByCase(req.user.id);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error en getMyUsageByCase:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo consumo por caso' });
  }
}

async function getAdminUsers(req, res) {
  try {
    const { from, to } = req.query;
    const result = await usageModel.getAdminUsersList(from, to);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error en getAdminUsers:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo usuarios' });
  }
}

async function getAdminUserDetail(req, res) {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ success: false, error: 'userId invalido' });
    }
    const { from, to } = req.query;
    const result = await usageModel.getAdminUserDetail(targetUserId, from, to);
    if (!result.user) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error en getAdminUserDetail:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo detalle de usuario' });
  }
}

module.exports = { getMyUsage, getMyUsageByDay, getMyUsageByCase, getAdminUsers, getAdminUserDetail };
