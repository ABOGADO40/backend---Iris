// =====================================================
// SISTEMA IRIS - Usage Model
// Queries para consultar consumo de tokens
// =====================================================

const prisma = require('../config/prisma');

function buildDateFilter(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return undefined;
  const filter = {};
  if (dateFrom) filter.gte = new Date(dateFrom);
  if (dateTo) {
    // new Date('YYYY-MM-DD') = midnight UTC; add 24h to include the full day
    filter.lt = new Date(new Date(dateTo).getTime() + 86400000);
  }
  return filter;
}

/**
 * Resumen de consumo del usuario autenticado
 */
async function getMyUsageSummary(userId, dateFrom, dateTo) {
  const where = { userId };
  const dateFilter = buildDateFilter(dateFrom, dateTo);
  if (dateFilter) where.createdAt = dateFilter;

  const [totals, byService] = await Promise.all([
    prisma.tokenUsage.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true, estimatedCost: true },
      _count: true
    }),
    prisma.tokenUsage.groupBy({
      by: ['serviceType'],
      where,
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true, estimatedCost: true },
      _count: true
    })
  ]);

  return {
    totalInputTokens: totals._sum.inputTokens || 0,
    totalOutputTokens: totals._sum.outputTokens || 0,
    totalTokens: totals._sum.totalTokens || 0,
    totalCost: parseFloat(totals._sum.estimatedCost || 0),
    totalCalls: totals._count,
    byService: byService.map(s => ({
      serviceType: s.serviceType,
      inputTokens: s._sum.inputTokens || 0,
      outputTokens: s._sum.outputTokens || 0,
      totalTokens: s._sum.totalTokens || 0,
      cost: parseFloat(s._sum.estimatedCost || 0),
      calls: s._count
    }))
  };
}

/**
 * Consumo por dia del usuario (para grafica)
 */
async function getMyUsageByDay(userId, dateFrom, dateTo) {
  const where = { userId };
  const dateFilter = buildDateFilter(dateFrom, dateTo);
  if (dateFilter) where.createdAt = dateFilter;

  const records = await prisma.tokenUsage.findMany({
    where,
    select: { createdAt: true, totalTokens: true, estimatedCost: true, serviceType: true },
    orderBy: { createdAt: 'asc' }
  });

  const byDay = {};
  for (const r of records) {
    const day = r.createdAt.toISOString().split('T')[0];
    if (!byDay[day]) byDay[day] = { date: day, totalTokens: 0, cost: 0, calls: 0 };
    byDay[day].totalTokens += r.totalTokens || 0;
    byDay[day].cost += parseFloat(r.estimatedCost || 0);
    byDay[day].calls += 1;
  }

  return Object.values(byDay);
}

/**
 * Consumo por caso del usuario (para grafica)
 */
async function getMyUsageByCase(userId, limit = 20) {
  const result = await prisma.tokenUsage.groupBy({
    by: ['caseId'],
    where: { userId, caseId: { not: null } },
    _sum: { totalTokens: true, estimatedCost: true },
    _count: true,
    orderBy: { _sum: { totalTokens: 'desc' } },
    take: limit
  });

  const caseIds = result.map(r => r.caseId).filter(Boolean);
  const cases = caseIds.length > 0
    ? await prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, title: true } })
    : [];
  const caseMap = Object.fromEntries(cases.map(c => [c.id, c.title]));

  return result.map(r => ({
    caseId: r.caseId,
    caseTitle: caseMap[r.caseId] || `Caso #${r.caseId}`,
    totalTokens: r._sum.totalTokens || 0,
    cost: parseFloat(r._sum.estimatedCost || 0),
    calls: r._count
  }));
}

/**
 * Admin: Lista de usuarios con totales de consumo
 */
async function getAdminUsersList(dateFrom, dateTo) {
  const where = {};
  const dateFilter = buildDateFilter(dateFrom, dateTo);
  if (dateFilter) where.createdAt = dateFilter;

  const byUser = await prisma.tokenUsage.groupBy({
    by: ['userId'],
    where,
    _sum: { inputTokens: true, outputTokens: true, totalTokens: true, estimatedCost: true },
    _count: true,
    orderBy: { _sum: { totalTokens: 'desc' } }
  });

  const userIds = byUser.map(r => r.userId);
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, email: true, role: { select: { name: true } }, isActive: true }
      })
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  return byUser.map(r => ({
    userId: r.userId,
    name: userMap[r.userId]?.fullName || 'Desconocido',
    email: userMap[r.userId]?.email || '',
    roleName: userMap[r.userId]?.role?.name || '',
    isActive: userMap[r.userId]?.isActive ?? true,
    totalInputTokens: r._sum.inputTokens || 0,
    totalOutputTokens: r._sum.outputTokens || 0,
    totalTokens: r._sum.totalTokens || 0,
    totalCost: parseFloat(r._sum.estimatedCost || 0),
    totalCalls: r._count
  }));
}

/**
 * Admin: Vista 360 de un usuario especifico
 */
async function getAdminUserDetail(targetUserId, dateFrom, dateTo) {
  const [summary, byDay, byCase, recentCalls] = await Promise.all([
    getMyUsageSummary(targetUserId, dateFrom, dateTo),
    getMyUsageByDay(targetUserId, dateFrom, dateTo),
    getMyUsageByCase(targetUserId),
    prisma.tokenUsage.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        serviceType: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        aiModel: true,
        estimatedCost: true,
        callType: true,
        createdAt: true,
        caseId: true
      }
    })
  ]);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, fullName: true, email: true, role: { select: { name: true } } }
  });

  return { user, summary, byDay, byCase, recentCalls };
}

module.exports = {
  getMyUsageSummary,
  getMyUsageByDay,
  getMyUsageByCase,
  getAdminUsersList,
  getAdminUserDetail
};
