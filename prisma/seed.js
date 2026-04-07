// =====================================================
// SISTEMA IRIS - Seed de Produccion
// Solo datos de configuracion indispensables
// Ejecutar: npm run db:seed
// =====================================================

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────
// FUNCIONES DE ENCRIPTACIÓN (para API Key)
// ─────────────────────────────────────────────────────
const ENCRYPTION_KEY = process.env.AI_ENCRYPTION_KEY || 'iris-sistema-2026-encryption-key-secure-32chars!';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function encryptApiKey(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// =====================================================
// ═══════════════════════════════════════════════════
// SECCION 1: DATOS CRITICOS (OBLIGATORIOS)
// Sin estos datos el sistema NO puede funcionar
// ═══════════════════════════════════════════════════
// =====================================================

// ─────────────────────────────────────────────────────
// 1.1 ROLES DEL SISTEMA
// ─────────────────────────────────────────────────────
const ROLES_DATA = [
  {
    name: 'SUPER_ADMIN',
    description: 'Administrador del sistema con acceso total a todas las funcionalidades'
  },
  {
    name: 'ADMIN',
    description: 'Administrador con gestion de usuarios y auditoria, sin configuracion de sistema'
  },
  {
    name: 'PERITO',
    description: 'Perito con acceso completo a casos, evidencias, analisis IA y exportaciones'
  },
  {
    name: 'ASISTENTE',
    description: 'Asistente con acceso basico a casos y evidencias, sin ejecucion de analisis IA'
  }
];

// ─────────────────────────────────────────────────────
// 1.2 PERMISOS DEL SISTEMA
// ─────────────────────────────────────────────────────
const PERMISSIONS_DATA = [
  // CASOS
  { code: 'CASES_READ', name: 'Ver casos', type: 'READ', resource: 'cases', description: 'Permite ver listado y detalle de casos' },
  { code: 'CASES_CREATE', name: 'Crear casos', type: 'WRITE', resource: 'cases', description: 'Permite crear nuevos casos' },
  { code: 'CASES_UPDATE', name: 'Editar casos', type: 'WRITE', resource: 'cases', description: 'Permite editar casos existentes' },
  // EVIDENCIAS
  { code: 'EVIDENCES_READ', name: 'Ver evidencias', type: 'READ', resource: 'evidences', description: 'Permite ver listado y detalle de evidencias' },
  { code: 'EVIDENCES_CREATE', name: 'Crear evidencias', type: 'WRITE', resource: 'evidences', description: 'Permite subir archivos o crear evidencias de texto' },
  // ANÁLISIS IA
  { code: 'ANALYSIS_EXECUTE', name: 'Ejecutar análisis IA', type: 'EXECUTE', resource: 'analysis', description: 'Permite ejecutar servicios de IA' },
  { code: 'ANALYSIS_READ', name: 'Ver análisis', type: 'READ', resource: 'analysis', description: 'Permite ver resultados de análisis' },
  // TAGS
  { code: 'TAGS_MANAGE', name: 'Gestionar etiquetas', type: 'WRITE', resource: 'tags', description: 'Permite crear, editar y asignar etiquetas' },
  // EXPORTACIONES
  { code: 'EXPORTS_CREATE', name: 'Crear exportaciones', type: 'WRITE', resource: 'exports', description: 'Permite exportar resultados a PDF/DOCX/PPTX' },
  // HISTORIAL
  { code: 'HISTORY_READ', name: 'Ver historial', type: 'READ', resource: 'history', description: 'Permite ver historial de análisis' },
  // ADMINISTRACIÓN (solo SUPER_ADMIN)
  { code: 'USERS_READ', name: 'Ver usuarios', type: 'READ', resource: 'users', description: 'Permite ver listado de usuarios' },
  { code: 'USERS_CREATE', name: 'Crear usuarios', type: 'WRITE', resource: 'users', description: 'Permite crear nuevos usuarios' },
  { code: 'USERS_UPDATE', name: 'Editar usuarios', type: 'WRITE', resource: 'users', description: 'Permite editar usuarios existentes' },
  { code: 'AUDIT_READ', name: 'Ver auditoría', type: 'READ', resource: 'audit', description: 'Permite ver logs de auditoría' },
  { code: 'AUDIT_EXPORT', name: 'Exportar auditoría', type: 'EXECUTE', resource: 'audit', description: 'Permite exportar logs de auditoría' },
  { code: 'SYSTEM_CONFIG', name: 'Configurar sistema', type: 'WRITE', resource: 'system', description: 'Permite configurar parámetros del sistema' }
];

// ─────────────────────────────────────────────────────
// 1.3 PERMISOS POR ROL
// SUPER_ADMIN: todos los permisos (asignados dinamicamente)
// ─────────────────────────────────────────────────────
const ADMIN_PERMISSION_CODES = [
  'CASES_READ',
  'CASES_CREATE',
  'CASES_UPDATE',
  'EVIDENCES_READ',
  'EVIDENCES_CREATE',
  'ANALYSIS_EXECUTE',
  'ANALYSIS_READ',
  'TAGS_MANAGE',
  'EXPORTS_CREATE',
  'HISTORY_READ',
  'USERS_READ',
  'USERS_CREATE',
  'USERS_UPDATE',
  'AUDIT_READ',
  'AUDIT_EXPORT'
];

const PERITO_PERMISSION_CODES = [
  'CASES_READ',
  'CASES_CREATE',
  'CASES_UPDATE',
  'EVIDENCES_READ',
  'EVIDENCES_CREATE',
  'ANALYSIS_EXECUTE',
  'ANALYSIS_READ',
  'TAGS_MANAGE',
  'EXPORTS_CREATE',
  'HISTORY_READ'
];

const ASISTENTE_PERMISSION_CODES = [
  'CASES_READ',
  'CASES_CREATE',
  'CASES_UPDATE',
  'EVIDENCES_READ',
  'EVIDENCES_CREATE',
  'ANALYSIS_READ',
  'TAGS_MANAGE',
  'HISTORY_READ'
];

// ─────────────────────────────────────────────────────
// 1.4 CONFIGURACIÓN DE SERVICIOS DE IA
// ─────────────────────────────────────────────────────
const AI_SERVICE_CONFIGS_DATA = [
  {
    service_type: 'TRANSLATE',
    service_name: 'Traduccion Pericial',
    service_description: 'Traduce documentos legales y periciales a lenguaje comun, considerando jurisdiccion y contexto del caso',
    api_url: 'https://api.openai.com/v1/responses',
    ai_model: 'gpt-4o',
    max_tokens: 16384,
    temperature: 0.7,
    is_active: false,
    prompt_id: null,
    prompt_version: null,
    use_responses_api: false
  },
  {
    service_type: 'RECOMMEND',
    service_name: 'Recomendacion de Peritos',
    service_description: 'Recomienda peritos especializados segun el caso, area legal y pais, considerando el contenido de archivos y limitaciones',
    api_url: 'https://api.openai.com/v1/responses',
    ai_model: 'gpt-4o',
    max_tokens: 16384,
    temperature: 0.7,
    is_active: false,
    prompt_id: null,
    prompt_version: null,
    use_responses_api: false
  },
  {
    service_type: 'COMPARE',
    service_name: 'Comparador de Evidencias',
    service_description: 'Compara dos evidencias identificando similitudes, diferencias y contradicciones segun la jurisdiccion',
    api_url: 'https://api.openai.com/v1/responses',
    ai_model: 'gpt-4o',
    max_tokens: 16384,
    temperature: 0.7,
    is_active: false,
    prompt_id: null,
    prompt_version: null,
    use_responses_api: false
  },
  {
    service_type: 'OBJECTIONS',
    service_name: 'Generador de Objeciones',
    service_description: 'Genera objeciones tecnicas y legales para evidencias periciales, identificando vulnerabilidades y preguntas estrategicas',
    api_url: 'https://api.openai.com/v1/responses',
    ai_model: 'gpt-4o',
    max_tokens: 16384,
    temperature: 0.7,
    is_active: false,
    prompt_id: null,
    prompt_version: null,
    use_responses_api: false
  },
  {
    service_type: 'TRANSCRIBE',
    service_name: 'Transcripcion Audio/Video',
    service_description: 'Transcribe archivos de audio y video usando OpenAI Whisper',
    api_url: 'https://api.openai.com/v1/audio/transcriptions',
    ai_model: 'whisper-1',
    max_tokens: 4096,
    temperature: 0.7,
    is_active: true,
    prompt_id: null,
    prompt_version: null,
    use_responses_api: false
  }
];

// ─────────────────────────────────────────────────────
// 1.5 VARIABLES DE CONFIGURACION IA (read-only)
// Mapeo entre claves internas y variables de prompt
// ─────────────────────────────────────────────────────
const AI_CONFIG_VARIABLES_DATA = [
  // TRANSLATE (5 variables)
  { serviceType: 'TRANSLATE', internalKey: 'pais', promptVarName: 'pais', description: 'Pais o jurisdiccion de referencia', displayOrder: 1 },
  { serviceType: 'TRANSLATE', internalKey: 'objetivo', promptVarName: 'objetivo', description: 'Objetivo del analisis solicitado por el abogado', displayOrder: 2 },
  { serviceType: 'TRANSLATE', internalKey: 'nivel_rigor', promptVarName: 'nivel_rigor', description: 'Nivel de rigor: basico / intermedio / alto', displayOrder: 3 },
  { serviceType: 'TRANSLATE', internalKey: 'paquete_evidencia', promptVarName: 'paquete_evidencia', description: 'Paquete consolidado: metadata del archivo + texto extraido', displayOrder: 4 },
  { serviceType: 'TRANSLATE', internalKey: 'contexto_caso_general', promptVarName: 'contexto_caso_general', description: 'Contexto general del caso judicial', displayOrder: 5 },

  // RECOMMEND (24 variables)
  { serviceType: 'RECOMMEND', internalKey: 'pais', promptVarName: 'pais', description: 'Pais o jurisdiccion de referencia', displayOrder: 1 },
  { serviceType: 'RECOMMEND', internalKey: 'objetivo', promptVarName: 'objetivo', description: 'Objetivo del analisis (integral, vacios probatorios, etc.)', displayOrder: 2 },
  { serviceType: 'RECOMMEND', internalKey: 'nivel_rigor', promptVarName: 'nivel_rigor', description: 'Nivel de rigor del analisis (basico, medio, alto)', displayOrder: 3 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_1', promptVarName: 'paquete_evidencia_1', description: 'Paquete de evidencia 1', displayOrder: 4 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_2', promptVarName: 'paquete_evidencia_2', description: 'Paquete de evidencia 2', displayOrder: 5 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_3', promptVarName: 'paquete_evidencia_3', description: 'Paquete de evidencia 3', displayOrder: 6 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_4', promptVarName: 'paquete_evidencia_4', description: 'Paquete de evidencia 4', displayOrder: 7 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_5', promptVarName: 'paquete_evidencia_5', description: 'Paquete de evidencia 5', displayOrder: 8 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_6', promptVarName: 'paquete_evidencia_6', description: 'Paquete de evidencia 6', displayOrder: 9 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_7', promptVarName: 'paquete_evidencia_7', description: 'Paquete de evidencia 7', displayOrder: 10 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_8', promptVarName: 'paquete_evidencia_8', description: 'Paquete de evidencia 8', displayOrder: 11 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_9', promptVarName: 'paquete_evidencia_9', description: 'Paquete de evidencia 9', displayOrder: 12 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_10', promptVarName: 'paquete_evidencia_10', description: 'Paquete de evidencia 10', displayOrder: 13 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_11', promptVarName: 'paquete_evidencia_11', description: 'Paquete de evidencia 11', displayOrder: 14 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_12', promptVarName: 'paquete_evidencia_12', description: 'Paquete de evidencia 12', displayOrder: 15 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_13', promptVarName: 'paquete_evidencia_13', description: 'Paquete de evidencia 13', displayOrder: 16 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_14', promptVarName: 'paquete_evidencia_14', description: 'Paquete de evidencia 14', displayOrder: 17 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_15', promptVarName: 'paquete_evidencia_15', description: 'Paquete de evidencia 15', displayOrder: 18 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_16', promptVarName: 'paquete_evidencia_16', description: 'Paquete de evidencia 16', displayOrder: 19 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_17', promptVarName: 'paquete_evidencia_17', description: 'Paquete de evidencia 17', displayOrder: 20 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_18', promptVarName: 'paquete_evidencia_18', description: 'Paquete de evidencia 18', displayOrder: 21 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_19', promptVarName: 'paquete_evidencia_19', description: 'Paquete de evidencia 19', displayOrder: 22 },
  { serviceType: 'RECOMMEND', internalKey: 'paquete_evidencia_20', promptVarName: 'paquete_evidencia_20', description: 'Paquete de evidencia 20', displayOrder: 23 },
  { serviceType: 'RECOMMEND', internalKey: 'contexto_caso_general', promptVarName: 'contexto_caso_general', description: 'Contexto general del expediente judicial', displayOrder: 24 },

  // COMPARE (6 variables)
  { serviceType: 'COMPARE', internalKey: 'pais', promptVarName: 'pais', description: 'Pais o jurisdiccion legal del caso', displayOrder: 1 },
  { serviceType: 'COMPARE', internalKey: 'objetivo', promptVarName: 'objetivo', description: 'Objetivo de la comparacion', displayOrder: 2 },
  { serviceType: 'COMPARE', internalKey: 'nivel_rigor', promptVarName: 'nivel_rigor', description: 'Nivel de exhaustividad del analisis', displayOrder: 3 },
  { serviceType: 'COMPARE', internalKey: 'paquete_evidencia_1', promptVarName: 'paquete_evidencia_1', description: 'Contenido completo de la primera evidencia', displayOrder: 4 },
  { serviceType: 'COMPARE', internalKey: 'paquete_evidencia_2', promptVarName: 'paquete_evidencia_2', description: 'Contenido completo de la segunda evidencia', displayOrder: 5 },
  { serviceType: 'COMPARE', internalKey: 'contexto_caso_general', promptVarName: 'contexto_caso_general', description: 'Contexto general del caso con marcadores de imagen', displayOrder: 6 },

  // OBJECTIONS (5 variables)
  { serviceType: 'OBJECTIONS', internalKey: 'pais', promptVarName: 'pais', description: 'Pais o jurisdiccion', displayOrder: 1 },
  { serviceType: 'OBJECTIONS', internalKey: 'objetivo', promptVarName: 'objetivo', description: 'defensa / ataque / analisis', displayOrder: 2 },
  { serviceType: 'OBJECTIONS', internalKey: 'nivel_rigor', promptVarName: 'nivel_rigor', description: 'alto / medio / bajo', displayOrder: 3 },
  { serviceType: 'OBJECTIONS', internalKey: 'paquete_evidencias', promptVarName: 'paquete_evidencias', description: 'Contenido de las evidencias', displayOrder: 4 },
  { serviceType: 'OBJECTIONS', internalKey: 'contexto_caso_general', promptVarName: 'contexto_caso_general', description: 'Contexto general del caso', displayOrder: 5 }
];

// ─────────────────────────────────────────────────────
// 1.6 USUARIOS DEL SISTEMA (Minimo 1 SUPER_ADMIN)
// ─────────────────────────────────────────────────────
const USERS_DATA = [
  {
    email: 'admin@iris.com',
    password: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin2026!',
    fullName: 'Administrador Sistema IRIS',
    roleName: 'SUPER_ADMIN'
  }
];


// =====================================================
// FUNCIÓN PRINCIPAL DE SEED
// =====================================================

async function main() {
  console.log('═'.repeat(60));
  console.log('     SISTEMA IRIS - Seed de Produccion');
  console.log('═'.repeat(60) + '\n');

  // ─────────────────────────────────────────────────────
  // 1. CREAR ROLES
  // ─────────────────────────────────────────────────────
  console.log('[1/7] Creando roles del sistema...');

  const roles = {};
  for (const roleData of ROLES_DATA) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: { description: roleData.description },
      create: {
        name: roleData.name,
        description: roleData.description,
        isActive: true
      }
    });
    roles[roleData.name] = role;
    console.log(`   ✓ Rol: ${role.name} (ID: ${role.id})`);
  }

  // ─────────────────────────────────────────────────────
  // 2. CREAR PERMISOS
  // ─────────────────────────────────────────────────────
  console.log('\n[2/7] Creando permisos del sistema...');

  const permissions = {};
  for (const permData of PERMISSIONS_DATA) {
    const permission = await prisma.permission.upsert({
      where: { code: permData.code },
      update: {
        name: permData.name,
        description: permData.description,
        type: permData.type,
        resource: permData.resource
      },
      create: {
        ...permData,
        isActive: true
      }
    });
    permissions[permData.code] = permission;
  }
  console.log(`   ✓ ${Object.keys(permissions).length} permisos creados`);

  // ─────────────────────────────────────────────────────
  // 3. ASIGNAR PERMISOS A ROLES
  // ─────────────────────────────────────────────────────
  console.log('\n[3/7] Asignando permisos a roles...');

  // Helper para asignar permisos a un rol
  async function assignPermissions(roleName, permissionCodes) {
    let count = 0;
    for (const code of permissionCodes) {
      const perm = permissions[code];
      if (perm) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: roles[roleName].id,
              permissionId: perm.id
            }
          },
          update: {},
          create: {
            roleId: roles[roleName].id,
            permissionId: perm.id,
            isActive: true
          }
        });
        count++;
      }
    }
    return count;
  }

  // SUPER_ADMIN: todos los permisos
  const allPermCodes = Object.keys(permissions);
  const superAdminCount = await assignPermissions('SUPER_ADMIN', allPermCodes);
  console.log(`   ✓ SUPER_ADMIN: ${superAdminCount} permisos (todos)`);

  // ADMIN: gestion de usuarios y auditoria, sin config de sistema
  const adminCount = await assignPermissions('ADMIN', ADMIN_PERMISSION_CODES);
  console.log(`   ✓ ADMIN: ${adminCount} permisos (gestion + auditoria)`);

  // PERITO: acceso operativo completo
  const peritoCount = await assignPermissions('PERITO', PERITO_PERMISSION_CODES);
  console.log(`   ✓ PERITO: ${peritoCount} permisos (operativo completo)`);

  // ASISTENTE: acceso basico sin ejecucion de IA ni exportaciones
  const asistenteCount = await assignPermissions('ASISTENTE', ASISTENTE_PERMISSION_CODES);
  console.log(`   ✓ ASISTENTE: ${asistenteCount} permisos (basico)`);

  // ─────────────────────────────────────────────────────
  // 4. CREAR CONFIGURACION DE SERVICIOS IA
  // ─────────────────────────────────────────────────────
  console.log('\n[4/7] Creando configuracion de servicios IA...');

  const apiKey = process.env.AI_API_KEY;
  const encryptedApiKey = apiKey ? encryptApiKey(apiKey) : null;

  if (!encryptedApiKey) {
    console.log('   ⚠ ADVERTENCIA: No se encontro AI_API_KEY en .env');
  }

  for (const config of AI_SERVICE_CONFIGS_DATA) {
    const configWithKey = {
      ...config,
      api_key_encrypted: encryptedApiKey
    };

    await prisma.ai_service_configs.upsert({
      where: { service_type: config.service_type },
      update: {
        service_name: config.service_name,
        service_description: config.service_description,
        api_url: config.api_url,
        ai_model: config.ai_model,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        is_active: config.is_active,
        prompt_id: config.prompt_id,
        prompt_version: config.prompt_version,
        use_responses_api: config.use_responses_api
      },
      create: configWithKey
    });
    console.log(`   ✓ ${config.service_type}: ${config.service_name}`);
  }

  // ─────────────────────────────────────────────────────
  // 5. CREAR VARIABLES DE CONFIGURACION IA
  // ─────────────────────────────────────────────────────
  console.log('\n[5/7] Creando variables de configuracion IA...');

  let varCount = 0;
  for (const varData of AI_CONFIG_VARIABLES_DATA) {
    await prisma.aiConfigVariable.upsert({
      where: {
        serviceType_internalKey: {
          serviceType: varData.serviceType,
          internalKey: varData.internalKey
        }
      },
      update: {
        promptVarName: varData.promptVarName,
        description: varData.description,
        displayOrder: varData.displayOrder
      },
      create: varData
    });
    varCount++;
  }
  console.log(`   ✓ ${varCount} variables creadas (TRANSLATE: 5, RECOMMEND: 24, COMPARE: 6, OBJECTIONS: 5)`);

  // ─────────────────────────────────────────────────────
  // 6. CREAR USUARIO SUPER_ADMIN INICIAL
  // ─────────────────────────────────────────────────────
  console.log('\n[6/7] Creando usuario administrador...');

  const users = {};
  for (const userData of USERS_DATA) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        fullName: userData.fullName,
        roleId: roles[userData.roleName].id
      },
      create: {
        email: userData.email,
        passwordHash: passwordHash,
        fullName: userData.fullName,
        roleId: roles[userData.roleName].id,
        isActive: true,
        emailVerified: true
      }
    });
    users[userData.email] = user;
    console.log(`   ✓ ${user.email} (${userData.roleName})`);
  }

  // ─────────────────────────────────────────────────────
  // 7. REGISTRAR EN AUDITORIA
  // ─────────────────────────────────────────────────────
  console.log('\n[7/7] Registrando en auditoria...');

  await prisma.auditLog.create({
    data: {
      actorUserId: null,
      actionCode: 'SEED_EXECUTED',
      entityType: 'SYSTEM',
      entityId: null,
      details: {
        timestamp: new Date().toISOString(),
        version: '3.0',
        roles: Object.keys(roles).length,
        permissions: Object.keys(permissions).length,
        aiServices: AI_SERVICE_CONFIGS_DATA.length,
        aiConfigVariables: AI_CONFIG_VARIABLES_DATA.length,
        users: Object.keys(users).length
      }
    }
  });
  console.log('   ✓ Registro de auditoria creado');

  // =====================================================
  // RESUMEN FINAL
  // =====================================================
  console.log('\n' + '═'.repeat(60));
  console.log('          SEED COMPLETADO EXITOSAMENTE');
  console.log('═'.repeat(60));
  console.log(`
┌──────────────────────────────────────────────────────────┐
│  CONFIGURACION DEL SISTEMA                               │
├──────────────────────────────────────────────────────────┤
│  Roles:              ${String(Object.keys(roles).length).padEnd(34)}│
│  Permisos:           ${String(Object.keys(permissions).length).padEnd(34)}│
│  Servicios IA:       ${String(AI_SERVICE_CONFIGS_DATA.length).padEnd(34)}│
│  Variables IA:       ${String(varCount).padEnd(34)}│
│  Usuarios:           ${String(Object.keys(users).length).padEnd(34)}│
├──────────────────────────────────────────────────────────┤
│  PERMISOS POR ROL                                        │
├──────────────────────────────────────────────────────────┤
│  SUPER_ADMIN:        ${String(superAdminCount + ' (todos)').padEnd(34)}│
│  ADMIN:              ${String(adminCount + ' (gestion + auditoria)').padEnd(34)}│
│  PERITO:             ${String(peritoCount + ' (operativo completo)').padEnd(34)}│
│  ASISTENTE:          ${String(asistenteCount + ' (basico)').padEnd(34)}│
├──────────────────────────────────────────────────────────┤
│  SERVICIOS IA                                            │
├──────────────────────────────────────────────────────────┤
│  TRANSLATE:   Traduccion Pericial (gpt-4o)               │
│  RECOMMEND:   Recomendacion de Peritos (gpt-4o)          │
│  COMPARE:     Comparador de Evidencias (gpt-4o)          │
│  OBJECTIONS:  Generador de Objeciones (gpt-4o)           │
│  TRANSCRIBE:  Transcripcion Audio/Video (whisper-1)      │
├──────────────────────────────────────────────────────────┤
│  ACCESO INICIAL                                          │
├──────────────────────────────────────────────────────────┤
│  Email:    admin@iris.com                                │
│  Password: (segun ADMIN_DEFAULT_PASSWORD o Admin2026!)   │
│  Rol:      SUPER_ADMIN                                   │
└──────────────────────────────────────────────────────────┘
`);
  console.log('═'.repeat(60) + '\n');
}

// =====================================================
// EJECUCIÓN
// =====================================================

main()
  .catch((e) => {
    console.error('\n[ERROR] Falló el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
