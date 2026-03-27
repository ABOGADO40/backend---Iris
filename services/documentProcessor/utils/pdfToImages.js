/**
 * pdfToImages - Renderiza paginas de PDF como imagenes
 *
 * Ejecuta el renderizado en un PROCESO HIJO AISLADO (pdfRenderWorker.js)
 * para proteger al proceso principal de Segmentation faults causados
 * por @napi-rs/canvas con ciertos PDFs.
 *
 * Si el worker crashea, RECHAZA la promesa con un error descriptivo
 * para que el caller sepa que se perdio informacion visual.
 *
 * Soporta renderizar paginas especificas (no todas) para optimizar
 * cuando solo las paginas escaneadas/imagen necesitan renderizado.
 *
 * Timeout dinamico: 30s base + 5s por pagina, tope 120s.
 */

const { fork } = require('child_process');
const path = require('path');

const WORKER_PATH = path.join(__dirname, 'pdfRenderWorker.js');
const TIMEOUT_BASE_MS = 30000;       // 30 segundos base
const TIMEOUT_PER_PAGE_MS = 5000;    // 5 segundos por pagina
const TIMEOUT_MAX_MS = 120000;       // 120 segundos tope maximo

/**
 * Calcula timeout dinamico segun cantidad de paginas
 * @param {number} pageCount - Cantidad de paginas a renderizar
 * @returns {number} Timeout en milisegundos
 */
function calculateTimeout(pageCount) {
  const calculated = TIMEOUT_BASE_MS + (pageCount * TIMEOUT_PER_PAGE_MS);
  return Math.min(calculated, TIMEOUT_MAX_MS);
}

/**
 * Renderiza paginas de un PDF como imagenes JPEG
 * @param {string} filePath - Ruta al archivo PDF
 * @param {Object} options
 * @param {number[]} options.pages - Paginas especificas a renderizar (ej: [3, 5, 8]). Si no se proporciona, renderiza todas.
 * @param {number} options.scale - Factor de escala para renderizado (default 1.5)
 * @param {number} options.quality - Calidad JPEG 0-100 (default 80)
 * @param {number} options.maxDimension - Dimension maxima en px (default 1024)
 * @returns {Promise<Array<{base64: string, mimeType: string, pageNumber: number, index: number, width: number, height: number}>>}
 * @throws {Error} Si el worker crashea, timeout o falla - NUNCA pierde info silenciosamente
 */
async function renderPdfPages(filePath, options = {}) {
  const pagesToRender = options.pages || [];
  const timeoutMs = calculateTimeout(pagesToRender.length || 10);

  console.log(`[pdfToImages] Renderizando en worker aislado: ${filePath} (${pagesToRender.length || 'todas'} paginas, timeout: ${Math.round(timeoutMs / 1000)}s)`);

  return new Promise((resolve, reject) => {
    let settled = false;

    function finish(images, error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        console.error(`[pdfToImages] ERROR: ${error}`);
        reject(new Error(error));
      } else {
        console.log(`[pdfToImages] Resultado: ${images.length} imagen(es) obtenidas`);
        resolve(images);
      }
    }

    // Crear proceso hijo aislado
    let child;
    try {
      child = fork(WORKER_PATH, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });
    } catch (forkError) {
      reject(new Error(`No se pudo crear worker de renderizado: ${forkError.message}`));
      return;
    }

    // Timeout dinamico
    const timer = setTimeout(() => {
      finish(null, `Timeout renderizando PDF (${Math.round(timeoutMs / 1000)}s) - el proceso fue terminado. Paginas solicitadas: ${pagesToRender.join(', ') || 'todas'}`);
      child.kill('SIGKILL');
    }, timeoutMs);

    // Recibir resultado del worker
    child.on('message', (msg) => {
      if (msg.success) {
        finish(msg.images, null);
      } else {
        finish(null, `Error en renderizado de PDF: ${msg.error}`);
      }
    });

    // Worker murio (segfault, OOM, etc.)
    child.on('exit', (code, signal) => {
      if (signal === 'SIGKILL') {
        finish(null, `Worker de renderizado terminado (signal: SIGKILL) - posible timeout o falta de memoria`);
      } else if (code !== 0 && code !== null) {
        finish(null, `Worker de renderizado fallo (code: ${code}) - posible error de segmentacion`);
      }
    });

    // Error al comunicarse con el worker
    child.on('error', (err) => {
      finish(null, `Error iniciando worker de renderizado: ${err.message}`);
    });

    // Capturar stderr del worker para debug
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.warn(`[pdfToImages:worker:stderr] ${msg}`);
      });
    }

    // Enviar trabajo al worker (incluye paginas especificas si las hay)
    child.send({ filePath, options });
  });
}

module.exports = { renderPdfPages };
