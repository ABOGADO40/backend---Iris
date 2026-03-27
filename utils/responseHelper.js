// =====================================================
// SISTEMA IRIS - Response Helper Utility
// Estandariza respuestas HTTP
// =====================================================

/**
 * Serializa un objeto convirtiendo BigInt a Number/String
 * JSON.stringify no soporta BigInt nativamente
 * @param {any} data - Datos a serializar
 * @returns {any} - Datos con BigInt convertidos
 */
function serializeBigInt(data) {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data === 'bigint') {
    // Convertir a Number si es seguro, sino a String
    return Number.isSafeInteger(Number(data)) ? Number(data) : data.toString();
  }
  if (Array.isArray(data)) {
    return data.map(item => serializeBigInt(item));
  }
  // No modificar objetos Date - JSON.stringify los maneja correctamente
  if (data instanceof Date) {
    return data;
  }
  if (typeof data === 'object' && data !== null) {
    const result = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = serializeBigInt(data[key]);
      }
    }
    return result;
  }
  return data;
}

/**
 * Envia respuesta exitosa
 * @param {Object} res - Express response object
 * @param {Object} data - Datos a enviar
 * @param {string} message - Mensaje de exito
 * @param {number} statusCode - Codigo HTTP (default 200)
 */
function success(res, data = null, message = 'Operacion exitosa', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data: serializeBigInt(data),
  });
}

/**
 * Envia respuesta de error
 * @param {Object} res - Express response object
 * @param {string} message - Mensaje de error
 * @param {number} statusCode - Codigo HTTP (default 400)
 * @param {Object|null} errors - Errores adicionales
 */
function error(res, message = 'Error en la operacion', statusCode = 400, errors = null) {
  const response = {
    success: false,
    message,
  };
  if (errors) {
    response.errors = errors;
  }
  return res.status(statusCode).json(response);
}

/**
 * Envia respuesta de recurso creado
 * @param {Object} res - Express response object
 * @param {Object} data - Datos del recurso creado
 * @param {string} message - Mensaje de exito
 */
function created(res, data, message = 'Recurso creado exitosamente') {
  return success(res, data, message, 201);
}

/**
 * Envia respuesta de no encontrado
 * @param {Object} res - Express response object
 * @param {string} message - Mensaje de error
 */
function notFound(res, message = 'Recurso no encontrado') {
  return error(res, message, 404);
}

/**
 * Envia respuesta de no autorizado
 * @param {Object} res - Express response object
 * @param {string} message - Mensaje de error
 */
function unauthorized(res, message = 'No autorizado') {
  return error(res, message, 401);
}

/**
 * Envia respuesta de prohibido
 * @param {Object} res - Express response object
 * @param {string} message - Mensaje de error
 */
function forbidden(res, message = 'Acceso denegado') {
  return error(res, message, 403);
}

/**
 * Envia respuesta de error del servidor
 * @param {Object} res - Express response object
 * @param {string} message - Mensaje de error
 */
function serverError(res, message = 'Error interno del servidor') {
  return error(res, message, 500);
}

/**
 * Envia respuesta de validacion fallida
 * @param {Object} res - Express response object
 * @param {Array} errors - Array de errores de validacion
 */
function validationError(res, errors) {
  return res.status(422).json({
    success: false,
    message: 'Error de validacion',
    errors,
  });
}

module.exports = {
  success,
  error,
  created,
  notFound,
  unauthorized,
  forbidden,
  serverError,
  validationError,
};
