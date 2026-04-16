// =====================================================
// SISTEMA IRIS - Constantes del Sistema
// Fecha: 2026-01-19
// =====================================================

/**
 * Roles del sistema
 */
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  USER: 'USER',
};

/**
 * Tipos de servicio de analisis IA
 */
const SERVICE_TYPES = {
  TRANSLATE: 'TRANSLATE',
  RECOMMEND: 'RECOMMEND',
  COMPARE: 'COMPARE',
  OBJECTIONS: 'OBJECTIONS',
};

/**
 * Estados de analisis
 */
const ANALYSIS_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

/**
 * Tipos de evidencia
 */
const EVIDENCE_TYPES = {
  FILE: 'FILE',
  TEXT: 'TEXT',
};

/**
 * Formatos de exportacion
 */
const EXPORT_FORMATS = {
  PDF: 'PDF',
  DOCX: 'DOCX',
  PPTX: 'PPTX',
};

/**
 * Acciones de auditoria
 */
const AUDIT_ACTIONS = {
  // Autenticacion
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  REGISTER: 'REGISTER',

  // Casos
  CASE_CREATE: 'CASE_CREATE',
  CASE_UPDATE: 'CASE_UPDATE',
  CASE_DELETE: 'CASE_DELETE',
  CASE_VIEW: 'CASE_VIEW',

  // Evidencias
  EVIDENCE_CREATE: 'EVIDENCE_CREATE',
  EVIDENCE_UPDATE: 'EVIDENCE_UPDATE',
  EVIDENCE_DELETE: 'EVIDENCE_DELETE',
  EVIDENCE_VIEW: 'EVIDENCE_VIEW',
  EVIDENCE_UPLOAD: 'EVIDENCE_UPLOAD',

  // Analisis IA
  ANALYSIS_REQUEST: 'ANALYSIS_REQUEST',
  ANALYSIS_COMPLETE: 'ANALYSIS_COMPLETE',
  ANALYSIS_ERROR: 'ANALYSIS_ERROR',

  // Exportaciones
  EXPORT_CREATE: 'EXPORT_CREATE',
  EXPORT_DOWNLOAD: 'EXPORT_DOWNLOAD',

  // Tags
  TAG_CREATE: 'TAG_CREATE',
  TAG_UPDATE: 'TAG_UPDATE',
  TAG_DELETE: 'TAG_DELETE',

  // Usuarios
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_DELETE: 'USER_DELETE',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  USER_PASSWORD_CHANGED: 'USER_PASSWORD_CHANGED',

  // Verificacion de email
  EMAIL_VERIFICATION_SENT: 'EMAIL_VERIFICATION_SENT',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  EMAIL_VERIFIED_BY_ADMIN: 'EMAIL_VERIFIED_BY_ADMIN',
};

/**
 * Tipos de entidad para auditoria
 */
const ENTITY_TYPES = {
  USER: 'USER',
  CASE: 'CASE',
  EVIDENCE: 'EVIDENCE',
  ANALYSIS: 'ANALYSIS',
  EXPORT: 'EXPORT',
  TAG: 'TAG',
  SESSION: 'SESSION',
};

/**
 * Disclaimer obligatorio para resultados de IA
 */
const DISCLAIMER = `AVISO LEGAL: Este documento ha sido generado con asistencia de inteligencia artificial y tiene caracter orientativo. No constituye dictamen pericial oficial, opinion juridica vinculante ni sustituye el criterio de un profesional habilitado. El usuario asume la responsabilidad exclusiva de verificar, validar y, en su caso, someter la informacion a revision por expertos certificados antes de utilizarla en procedimientos legales, judiciales o administrativos. El proveedor del sistema no garantiza la exactitud, completitud ni idoneidad del contenido generado para propositos especificos.`;

/**
 * Codigos de permisos
 */
const PERMISSION_CODES = {
  // Casos
  CASES_VIEW: 'cases:view',
  CASES_CREATE: 'cases:create',
  CASES_UPDATE: 'cases:update',
  CASES_DELETE: 'cases:delete',

  // Evidencias
  EVIDENCES_VIEW: 'evidences:view',
  EVIDENCES_CREATE: 'evidences:create',
  EVIDENCES_UPDATE: 'evidences:update',
  EVIDENCES_DELETE: 'evidences:delete',
  EVIDENCES_UPLOAD: 'evidences:upload',

  // Analisis
  ANALYSIS_REQUEST: 'analysis:request',
  ANALYSIS_VIEW: 'analysis:view',

  // Exportaciones
  EXPORTS_CREATE: 'exports:create',
  EXPORTS_DOWNLOAD: 'exports:download',

  // Tags
  TAGS_VIEW: 'tags:view',
  TAGS_CREATE: 'tags:create',
  TAGS_UPDATE: 'tags:update',
  TAGS_DELETE: 'tags:delete',

  // Auditoria
  AUDIT_VIEW: 'audit:view',

  // Usuarios
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DEACTIVATE: 'users:deactivate',
};

/**
 * Mensajes de error estandar
 */
const ERROR_MESSAGES = {
  UNAUTHORIZED: 'No autorizado. Token invalido o expirado.',
  FORBIDDEN: 'Acceso denegado. No tiene permisos para esta accion.',
  NOT_FOUND: 'Recurso no encontrado.',
  VALIDATION_ERROR: 'Error de validacion en los datos enviados.',
  INTERNAL_ERROR: 'Error interno del servidor.',
  INVALID_CREDENTIALS: 'Credenciales invalidas.',
  USER_EXISTS: 'El usuario ya existe con este email.',
  USER_INACTIVE: 'La cuenta de usuario esta inactiva.',
  USER_DELETED: 'La cuenta de usuario ha sido eliminada.',
  EMAIL_NOT_VERIFIED: 'Debes verificar tu correo electronico antes de iniciar sesion.',
};

module.exports = {
  ROLES,
  SERVICE_TYPES,
  ANALYSIS_STATUS,
  EVIDENCE_TYPES,
  EXPORT_FORMATS,
  AUDIT_ACTIONS,
  ENTITY_TYPES,
  DISCLAIMER,
  PERMISSION_CODES,
  ERROR_MESSAGES,
};
