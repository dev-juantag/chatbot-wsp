require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const prisma = require('./lib/prisma');
const { createClient } = require('@supabase/supabase-js');
const app = express();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || 'https://ssmmjezafbtopkpwmazz.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middlewares
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Rutas básicas
const { handleWebhook } = require('./services/whatsapp');
const { encrypt } = require('./lib/crypto');

// Guard de arranque: encola webhooks que llegan antes de que Prisma esté listo
let serverReady = false;
const pendingWebhooks = [];
setTimeout(() => {
  serverReady = true;
  if (pendingWebhooks.length > 0) {
    console.log(`⏳ Procesando ${pendingWebhooks.length} webhook(s) que llegaron durante el arranque...`);
    pendingWebhooks.forEach(body => handleWebhook(body).catch(console.error));
    pendingWebhooks.length = 0;
  }
}, 4000);

// Webhook para recibir mensajes desde el Docker de OpenWA
app.post('/webhook/openwa', async (req, res) => {
  // Responder 200 inmediatamente para que OpenWA no reintente
  res.status(200).send('OK');
  try {
    const body = req.body;
    if (!serverReady) {
      // Aún iniciando — encolar para procesar cuando Prisma esté listo
      const eventType = body?.event;
      if (eventType === 'message.received') {
        console.log(`⏳ [STARTUP QUEUE] Mensaje encolado durante arranque: ${body?.data?.body?.substring(0, 50)}`);
        pendingWebhooks.push(body);
      }
      return;
    }
    await handleWebhook(body);
  } catch (error) {
    console.error("Error procesando webhook:", error);
  }
});

// Importar middleware de autenticación
const { authMiddleware } = require('./lib/auth');

// Configuración SMTP Nodemailer para envío de correos (Zoho)
const nodemailer = require('nodemailer');
const resetCodes = new Map(); // email -> { code, expiresAt }

const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // TLS en puerto 587
  auth: {
    user: process.env.SMTP_USER || 'noreply@techtag.dev',
    pass: process.env.SMTP_PASS || 'NJaN1fRVLyBY'
  }
});

// Endpoint para que el CRM (humano) envíe un mensaje a un cliente
const { sendTextMessage, sendMediaMessage } = require('./services/whatsapp');
const { parseIntent } = require('./services/ai');

app.post('/api/messages/send', authMiddleware, async (req, res) => {
  try {
    const { contactId, content } = req.body;
    
    // Buscar el contacto aislado por tenant
    const contact = await prisma.contact.findFirst({ 
      where: { id: contactId, tenantId: req.user.tenantId } 
    });
    if (!contact) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    // Buscar sesión de WhatsApp asociada al Tenant
    const wsSession = await prisma.whatsappSession.findUnique({
      where: { tenantId: req.user.tenantId }
    });
    const sessionId = wsSession?.id || 'default';
    
    // Enviar el mensaje usando OpenWA
    await sendTextMessage(sessionId, contact.phone, content);
    
    // Guardarlo en BD como un mensaje humano con tenantId
    const message = await prisma.message.create({
      data: {
        tenantId: req.user.tenantId,
        contactId,
        direction: 'outbound',
        content: encrypt(content),
        senderType: 'human'
      }
    });

    res.json({ success: true, message });
  } catch (error) {
    console.error("Error enviando mensaje manual:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/messages/send-file', authMiddleware, async (req, res) => {
  try {
    const { contactId, fileBase64, fileName, mimeType, caption } = req.body;
    
    const contact = await prisma.contact.findFirst({ 
      where: { id: contactId, tenantId: req.user.tenantId } 
    });
    if (!contact) return res.status(404).json({ error: 'Contacto no encontrado' });

    // Buscar sesión de WhatsApp asociada al Tenant
    const wsSession = await prisma.whatsappSession.findUnique({
      where: { tenantId: req.user.tenantId }
    });
    const sessionId = wsSession?.id || 'default';
    
    // Quitar prefijo base64
    let rawBase64 = fileBase64;
    if (fileBase64.includes('base64,')) {
        rawBase64 = fileBase64.split('base64,')[1];
    }
    
    await sendMediaMessage(sessionId, contact.phone, rawBase64, fileName, caption, mimeType);
    
    const message = await prisma.message.create({
      data: {
        tenantId: req.user.tenantId,
        contactId,
        direction: 'outbound',
        content: encrypt(caption ? `[Archivo adjunto: ${fileName}]\n${caption}` : `[Archivo adjunto: ${fileName}]`),
        senderType: 'human'
      }
    });

    res.json({ success: true, message });
  } catch (error) {
    console.error("Error enviando archivo manual:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para encender o apagar el bot individualmente por chat
app.post('/api/contacts/:id/toggle-bot', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'activo', 'pausado', 'apagado'

    const contactExists = await prisma.contact.findFirst({
      where: { id, tenantId: req.user.tenantId }
    });
    if (!contactExists) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    
    let botPausedUntil = null;
    let pipelineStage = 'nuevo';

    if (status === 'pausado') {
      botPausedUntil = new Date(Date.now() + 5 * 60 * 60 * 1000); // 5 horas en el futuro
      pipelineStage = 'handoff';
    } else if (status === 'apagado') {
      botPausedUntil = new Date('2099-12-31T23:59:59.999Z'); // Apagado manual
      pipelineStage = 'handoff';
    }
    
    const contact = await prisma.contact.update({
      where: { id },
      data: { botPausedUntil, pipelineStage }
    });
    
    res.json({ success: true, contact });
  } catch (error) {
    console.error("Error toggling bot:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para sincronizar el estado del bot local con la base de datos central (Heartbeat)
app.post('/api/whatsapp/status/sync', authMiddleware, async (req, res) => {
  try {
    const { status, sessionId } = req.body;
    if (!status) return res.status(400).json({ error: 'El estado es requerido.' });

    if (!req.user.tenantId) {
      return res.json({ success: true, message: 'Heartbeat omitido para Superadmin sin local asignado.' });
    }

    const whatsappSession = await prisma.whatsappSession.upsert({
      where: { tenantId: req.user.tenantId },
      update: { 
        status, 
        id: sessionId || undefined,
        updatedAt: new Date()
      },
      create: {
        id: sessionId || undefined,
        tenantId: req.user.tenantId,
        status
      }
    });

    res.json({ success: true, whatsappSession });
  } catch (error) {
    console.error("Error sincronizando estado de whatsapp:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint de health check para Docker / Coolify
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint para consultar el estado y obtener el código QR único del negocio
app.get('/api/whatsapp/status', authMiddleware, async (req, res) => {
  try {
    if (!req.user.tenantId) {
      return res.json({ status: 'disconnected', message: 'Superadmin global' });
    }

    const tenantId = req.user.tenantId;
    const sessionName = `tenant-${tenantId.slice(0, 8)}`;

    const OPENWA_URL = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const OWA_KEY = process.env.OPENWA_API_KEY || 'default_key';

    // Obtener lista de sesiones en OpenWA
    let openwaSessions = [];
    try {
      const listRes = await axios.get(`${OPENWA_URL}/sessions`, { headers: { 'x-api-key': OWA_KEY }, timeout: 4000 });
      openwaSessions = listRes.data || [];
    } catch (_) {}

    let owaSession = openwaSessions.find(s => s.name === sessionName);

    // Si la sesión ya está conectada en OpenWA, sincronizamos y devolvemos phone/pushName reales
    const isConnectedInOwa = owaSession && ['ready', 'WORKING', 'inChat', 'authenticated', 'isLogged', 'connected'].includes(owaSession.status);
    if (isConnectedInOwa) {
      const phoneVal = owaSession.phone ? `+${owaSession.phone}` : '+000000000000';
      const pushNameVal = owaSession.pushName || 'JuanF';
      const sessionDataStr = JSON.stringify({
        phone: phoneVal,
        pushName: pushNameVal,
        sessionName: owaSession.name,
        owaSessionId: owaSession.id
      });

      // Asegurar que la sesión tenga suscripción activa al Webhook en OpenWA
      try {
        const webhookUrl = process.env.WEBHOOK_URL || 'http://host.docker.internal:3001/webhook/openwa';
        const webhooksRes = await axios.get(`${OPENWA_URL}/sessions/${owaSession.id}/webhooks`, { headers: { 'x-api-key': OWA_KEY } });
        const existingWebhooks = webhooksRes.data || [];
        const hasWebhook = existingWebhooks.some(w => w.url === webhookUrl && w.active);
        if (!hasWebhook) {
          await axios.post(`${OPENWA_URL}/sessions/${owaSession.id}/webhooks`, {
            url: webhookUrl,
            events: ['*']
          }, { headers: { 'x-api-key': OWA_KEY } });
          console.log(`📡 Webhook suscrito exitosamente para la sesión ${owaSession.name} (${owaSession.id}) -> ${webhookUrl}`);
        }
      } catch (whErr) {
        console.warn("Advertencia al suscribir webhook en OpenWA:", whErr.message);
      }

      await prisma.whatsappSession.upsert({
        where: { tenantId },
        update: { status: 'CONNECTED', sessionData: sessionDataStr, updatedAt: new Date() },
        create: { tenant: { connect: { id: tenantId } }, status: 'CONNECTED', sessionData: sessionDataStr }
      });

      return res.json({
        status: 'ready',
        sessionId: owaSession.id,
        phone: phoneVal,
        pushName: pushNameVal
      });
    }

    // Si la base de datos registra que está CONNECTED, usar como fallback de respaldo para evitar falsos negativos en la UI
    const dbSession = await prisma.whatsappSession.findUnique({ where: { tenantId } });
    if (dbSession && dbSession.status === 'CONNECTED') {
      const parsedData = dbSession.sessionData ? JSON.parse(dbSession.sessionData) : {};
      return res.json({
        status: 'ready',
        sessionId: dbSession.id,
        phone: parsedData.phone || '+000000000000',
        pushName: parsedData.pushName || 'WhatsApp Business'
      });
    }

    // Si la sesión no existe en OpenWA, la creamos
    if (!owaSession) {
      try {
        const createRes = await axios.post(`${OPENWA_URL}/sessions`, { name: sessionName }, { headers: { 'x-api-key': OWA_KEY } });
        owaSession = createRes.data;
      } catch (createErr) {
        console.error("Error creando sesión en OpenWA:", createErr.response?.data || createErr.message);
      }
    }

    if (!owaSession) {
      return res.json({ status: 'disconnected' });
    }

    // Si la sesión existe pero no ha arrancado (status === 'created' o 'disconnected'), la iniciamos en segundo plano
    if (owaSession.status === 'created' || owaSession.status === 'disconnected') {
      // Lanzar el start de forma async sin bloquear la respuesta
      axios.post(`${OPENWA_URL}/sessions/${owaSession.id}/start`, {}, { headers: { 'x-api-key': OWA_KEY } })
        .catch(startErr => console.error("Error iniciando sesión en OpenWA:", startErr.response?.data || startErr.message));
      // Devolver 'starting' para que el frontend haga polling y detecte qr_ready en el siguiente ciclo
      return res.json({ status: 'starting', sessionId: owaSession.id });
    }

    // Si la sesión está en qr_ready, obtenemos el código QR en base64 directamente
    if (owaSession.status === 'qr_ready' || owaSession.engineLoaded) {
      try {
        const qrRes = await axios.get(`${OPENWA_URL}/sessions/${owaSession.id}/qr`, { headers: { 'x-api-key': OWA_KEY } });
        if (qrRes.data && qrRes.data.qrCode) {
          return res.json({
            status: 'qr_ready',
            qrCode: qrRes.data.qrCode,
            sessionId: owaSession.id
          });
        }
      } catch (qrErr) {
        console.error("Error obteniendo QR en base64:", qrErr.response?.data || qrErr.message);
      }
    }

    res.json({ status: owaSession.status || 'loading', sessionId: owaSession.id });
  } catch (error) {
    console.error("Error consultando estado de whatsapp:", error);
    res.status(500).json({ error: 'Error al consultar estado de WhatsApp.' });
  }
});

// Endpoint para desconectar la sesión de WhatsApp de un negocio (Desconexión manual)
app.post('/api/whatsapp/disconnect', authMiddleware, async (req, res) => {
  try {
    if (!req.user.tenantId) {
      return res.status(400).json({ error: 'Superadmin no tiene un local asignado para desconectar.' });
    }

    const tenantId = req.user.tenantId;
    const sessionName = `tenant-${tenantId.slice(0, 8)}`;
    const OPENWA_URL = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const OWA_KEY = process.env.OPENWA_API_KEY || 'default_key';

    // 1. Eliminar sesión en OpenWA si existe
    try {
      const listRes = await axios.get(`${OPENWA_URL}/sessions`, { headers: { 'x-api-key': OWA_KEY } });
      const owaSessions = listRes.data || [];
      const sessionToDelete = owaSessions.find(s => s.name === sessionName);

      if (sessionToDelete) {
        await axios.delete(`${OPENWA_URL}/sessions/${sessionToDelete.id}`, { headers: { 'x-api-key': OWA_KEY } }).catch(() => {});
      }
    } catch (e) {
      console.warn("Advertencia al eliminar sesión en OpenWA:", e.message);
    }

    // 2. Actualizar estado en la base de datos PostgreSQL
    const existing = await prisma.whatsappSession.findUnique({ where: { tenantId } });
    if (existing) {
      await prisma.whatsappSession.update({
        where: { id: existing.id },
        data: { status: 'DISCONNECTED', updatedAt: new Date() }
      });
    } else {
      await prisma.whatsappSession.create({
        data: {
          tenant: { connect: { id: tenantId } },
          status: 'DISCONNECTED'
        }
      });
    }

    res.json({ success: true, message: 'WhatsApp desconectado correctamente.' });
  } catch (error) {
    console.error("Error desconectando WhatsApp:", error);
    res.status(500).json({ error: 'Error al desconectar WhatsApp.' });
  }
});

// Endpoint para consultar la configuración del agente IA del negocio logueado
app.get('/api/agent-config', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    let config = null;

    if (!tenantId) {
      config = await prisma.agentConfig.findFirst({ where: { tenantId: null } });
    } else {
      config = await prisma.agentConfig.findUnique({
        where: { tenantId }
      });

      if (!config) {
        config = await prisma.agentConfig.create({
          data: {
            tenantId,
            botName: 'Tagu',
            isActive: true
          }
        });
      }
    }

    const { decrypt } = require('./lib/crypto');
    const hasCustomApiKey = !!config?.geminiApiKey;
    let maskedApiKey = null;
    if (hasCustomApiKey) {
      const dec = decrypt(config.geminiApiKey);
      const lastFour = dec && dec.length >= 4 ? dec.slice(-4) : '****';
      maskedApiKey = `••••••••••••••••${lastFour}`;
    }

    const safeConfig = config ? { ...config } : {};
    delete safeConfig.geminiApiKey;

    res.json({
      ...safeConfig,
      hasCustomApiKey,
      maskedApiKey
    });
  } catch (error) {
    console.error("Error obteniendo agent-config:", error);
    res.status(500).json({ error: 'Error obteniendo la configuración' });
  }
});

// Endpoint para guardar o actualizar la configuración del agente (incluyendo el interruptor isActive y la API Key personalizada)
app.put('/api/agent-config', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { encrypt } = require('./lib/crypto');
    const { isActive, businessName, workingHours, botName, identityConfig, objectives, agendaSettings, additionalInfo, geminiApiKey, menuPdfUrl, menuPdfName, menuPdfBase64, deleteMessagesOlderThan12Days, businessType } = req.body;

    const dataToUpdate = {};
    if (typeof isActive === 'boolean') dataToUpdate.isActive = isActive;
    if (businessName !== undefined) dataToUpdate.businessName = businessName;
    if (workingHours !== undefined) dataToUpdate.workingHours = workingHours;
    if (botName !== undefined) dataToUpdate.botName = botName;
    if (identityConfig !== undefined) dataToUpdate.identityConfig = identityConfig;
    if (objectives !== undefined) dataToUpdate.objectives = objectives;
    if (agendaSettings !== undefined) dataToUpdate.agendaSettings = agendaSettings;
    if (additionalInfo !== undefined) dataToUpdate.additionalInfo = additionalInfo;
    if (menuPdfUrl !== undefined) dataToUpdate.menuPdfUrl = menuPdfUrl;
    if (menuPdfName !== undefined) dataToUpdate.menuPdfName = menuPdfName;
    if (menuPdfBase64 !== undefined) dataToUpdate.menuPdfBase64 = menuPdfBase64;
    if (deleteMessagesOlderThan12Days !== undefined) dataToUpdate.deleteMessagesOlderThan12Days = deleteMessagesOlderThan12Days;
    if (businessType !== undefined) dataToUpdate.businessType = businessType;

    if (geminiApiKey !== undefined) {
      if (geminiApiKey === null || geminiApiKey === '') {
        dataToUpdate.geminiApiKey = null;
      } else if (typeof geminiApiKey === 'string' && !geminiApiKey.startsWith('••••')) {
        dataToUpdate.geminiApiKey = encrypt(geminiApiKey.trim());
      }
    }

    let config;
    if (tenantId) {
      const existing = await prisma.agentConfig.findUnique({ where: { tenantId } });
      if (existing) {
        config = await prisma.agentConfig.update({
          where: { id: existing.id },
          data: dataToUpdate
        });
      } else {
        config = await prisma.agentConfig.create({
          data: {
            tenant: { connect: { id: tenantId } },
            botName: botName || 'Tagu',
            isActive: isActive ?? true,
            ...dataToUpdate
          }
        });
      }
    } else {
      const first = await prisma.agentConfig.findFirst();
      if (first) {
        config = await prisma.agentConfig.update({
          where: { id: first.id },
          data: dataToUpdate
        });
      }
    }

    console.log(`⚙️ Configuración del bot actualizada para negocio (${tenantId || 'global'}): isActive = ${config?.isActive}`);
    res.json({ success: true, config });
  } catch (error) {
    console.error("Error actualizando agent-config:", error);
    res.status(500).json({ error: 'Error actualizando la configuración' });
  }
});

// Endpoint para el Probador IA (Sandbox) - Accesible para todos
app.post('/api/lab/chat', authMiddleware, async (req, res) => {
  try {
    const { message, history } = req.body;
    
    // Pasar tenantId para leer la configuración del negocio correcto
    const aiResponse = await parseIntent(message, null, history, req.user.tenantId);
    
    res.json({ success: true, response: aiResponse });
  } catch (error) {
    console.error("Error en el Probador IA:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// ==========================================
// RUTAS DE SUPERADMINISTADOR (CRUD Global)
// ==========================================

const requireSuperadmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol superadmin.' });
  }
  next();
};

// Listar todos los negocios (Tenants) con estadísticas de conexión
app.get('/api/superadmin/tenants', authMiddleware, requireSuperadmin, async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        whatsappSession: true,
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tenants);
  } catch (error) {
    console.error("Error obteniendo negocios para superadmin:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear nuevo negocio (Tenant) y configurar defaults
app.post('/api/superadmin/tenants', authMiddleware, requireSuperadmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre del negocio es requerido.' });

    // Crear Tenant
    const tenant = await prisma.tenant.create({
      data: { name }
    });

    // Crear configuración de bot predeterminada para el negocio
    await prisma.agentConfig.create({
      data: {
        tenantId: tenant.id,
        botName: 'Tagu',
        businessName: name,
        isActive: true,
        objectives: ["Agendar citas"]
      }
    });

    // Crear sesión de WhatsApp predeterminada
    await prisma.whatsappSession.create({
      data: {
        tenantId: tenant.id,
        status: 'DISCONNECTED'
      }
    });

    res.json({ success: true, tenant });
  } catch (error) {
    console.error("Error creando negocio:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Activar o desactivar negocio (Licencia/Mensualidad)
app.put('/api/superadmin/tenants/:id/toggle', authMiddleware, requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { isActive }
    });

    res.json({ success: true, tenant });
  } catch (error) {
    console.error("Error cambiando estado del negocio:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar negocio por completo (Casos extremos)
app.delete('/api/superadmin/tenants/:id', authMiddleware, requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.tenant.delete({ where: { id } });
    res.json({ success: true, message: 'Negocio eliminado correctamente' });
  } catch (error) {
    console.error("Error eliminando negocio:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear usuario administrador o asesor asociado a un negocio
app.post('/api/superadmin/users', authMiddleware, requireSuperadmin, async (req, res) => {
  try {
    const { id: providedId, email, password, role, tenantId } = req.body;
    if (!email || !role || !tenantId) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (email, role, tenantId)' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let authId = providedId;

    if (!authId) {
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }

      // 1. Crear el usuario en Supabase GoTrue directamente mediante la Admin API (ignora rate limits)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true, // Auto-confirmar el correo
        user_metadata: {
          role: role,
          tenant_id: tenantId
        }
      });

      if (authError) {
        console.error("Supabase Admin Error:", authError);
        return res.status(500).json({ error: "Error creando usuario en Supabase: " + authError.message });
      }

      authId = authData.user.id;
    }

    const user = await prisma.user.upsert({
      where: { id: authId },
      create: { id: authId, email: cleanEmail, role, tenantId, isActive: true },
      update: { email: cleanEmail, role, tenantId, isActive: true }
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error("Error creando usuario en superadmin:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

// Activar o desactivar usuario individual
app.put('/api/superadmin/users/:id/toggle', authMiddleware, requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { isActive }
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error("Error alternando estado de usuario:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// ==========================================
// RUTAS DE ADMINISTRADOR (Gestión de su Local)
// ==========================================

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol administrador.' });
  }
  next();
};

// Crear usuario empleado/asesor para su negocio
app.post('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id, email } = req.body;
    if (!id || !email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (id de auth, email)' });
    }

    // El empleado siempre hereda el tenantId del administrador logueado
    const user = await prisma.user.create({
      data: { 
        id, 
        email, 
        role: 'agent', 
        tenantId: req.user.tenantId 
      }
    });

    // Auto-confirmar correo en Supabase Auth
    try {
      await prisma.$executeRaw`UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = ${id}::uuid`;
    } catch (e) {
      console.warn("Auto-confirm error:", e.message);
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error("Error creando empleado:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Listar todos los usuarios de su negocio (admins + agentes)
app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(users);
  } catch (error) {
    console.error("Error listando empleados:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Activar o desactivar empleado propio
app.put('/api/admin/users/:id/toggle', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    // Asegurar que el usuario pertenece al mismo tenant
    const targetUser = await prisma.user.findFirst({
      where: { id, tenantId: req.user.tenantId }
    });
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado en tu negocio.' });

    const user = await prisma.user.update({
      where: { id },
      data: { isActive }
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error("Error alternando empleado:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// ==========================================
// RUTAS DE RECUPERACIÓN DE CONTRASEÑA (SMTP)
// ==========================================

// 1. Solicitud de código de recuperación
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'El correo electrónico es requerido.' });

    const cleanEmail = email.trim().toLowerCase();
    
    // Verificar si el usuario existe en nuestro CRM
    const user = await prisma.user.findFirst({
      where: { email: cleanEmail }
    });

    if (!user) {
      return res.status(404).json({ error: 'No existe ningún usuario registrado con este correo.' });
    }

    // Generar código aleatorio de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutos exactos

    resetCodes.set(cleanEmail, { code, expiresAt });

    // Plantilla del correo
    const mailOptions = {
      from: `"Chatbot CRM" <${process.env.SMTP_FROM || 'noreply@techtag.dev'}>`,
      to: cleanEmail,
      subject: 'Recuperación de Contraseña - Código de Verificación',
      text: `Recuperación de Contraseña\nHola,\n\nHas solicitado restablecer tu contraseña para ingresar a la plataforma Chatbot CRM para WhatsApp.\n\nUtiliza el siguiente código de verificación de 6 dígitos para continuar con el proceso:\n\n${code}\n\nEste código es de un solo uso y expirará en 5 minutos. Si no has solicitado este cambio, por favor ignora este correo`
    };

    await mailTransporter.sendMail(mailOptions);

    res.json({ success: true, message: 'Código de verificación enviado a tu correo.' });
  } catch (error) {
    console.error("Error enviando correo de recuperación:", error);
    res.status(500).json({ error: 'Error al enviar el correo de verificación. Revisa la configuración SMTP.' });
  }
});

// 2. Verificación del código de 6 dígitos
app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Datos incompletos.' });

    const cleanEmail = email.trim().toLowerCase();
    const record = resetCodes.get(cleanEmail);

    if (!record) {
      return res.status(400).json({ error: 'No se ha solicitado ningún código o ya expiró.' });
    }

    if (Date.now() > record.expiresAt) {
      resetCodes.delete(cleanEmail);
      return res.status(400).json({ error: 'El código de verificación ha expirado (límite de 5 minutos).' });
    }

    if (record.code !== code.trim()) {
      return res.status(400).json({ error: 'El código de 6 dígitos ingresado es incorrecto.' });
    }

    res.json({ success: true, valid: true });
  } catch (error) {
    console.error("Error verificando código:", error);
    res.status(500).json({ error: 'Error al verificar el código.' });
  }
});

// 3. Restablecer la contraseña en Supabase Auth
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'Datos incompletos.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });

    const cleanEmail = email.trim().toLowerCase();
    const record = resetCodes.get(cleanEmail);

    if (!record || Date.now() > record.expiresAt || record.code !== code.trim()) {
      return res.status(400).json({ error: 'Código de verificación inválido o expirado.' });
    }

    // Actualizar contraseña en Supabase Auth
    try {
      await prisma.$executeRaw`UPDATE auth.users SET encrypted_password = crypt(${newPassword}, gen_salt('bf')), email_confirmed_at = NOW() WHERE email = ${cleanEmail}`;
    } catch (dbErr) {
      console.error("Error ejecutando update en auth.users:", dbErr);
      return res.status(500).json({ error: 'No se pudo actualizar la contraseña en la base de datos.' });
    }

    // Inhabilitar código usado
    resetCodes.delete(cleanEmail);

    res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error("Error cambiando contraseña:", error);
    res.status(500).json({ error: 'Error al actualizar la contraseña.' });
  }
});


// Inicializar el servidor
const PORT = process.env.PORT || 3001;
const { startRemindersCron } = require('./services/reminders');
const { startWhatsappDaemon } = require('./services/whatsappDaemon');

app.listen(PORT, async () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
  console.log(`📡 Escuchando Webhooks de OpenWA en http://localhost:${PORT}/webhook/openwa`);
  
  // Auto-confirmar retroactivamente todos los usuarios de Supabase Auth sin verificar
  try {
    await prisma.$executeRaw`UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL`;
    console.log("✅ Auto-confirmación de usuarios procesada exitosamente.");
  } catch (e) {
    console.warn("Advertencia al auto-confirmar usuarios:", e.message);
  }

  // Iniciar motor de recordatorios
  startRemindersCron();

  // Iniciar demonio autónomo de WhatsApp (Sincronización 24/7 sin depender de la interfaz web)
  startWhatsappDaemon();

  // Iniciar tarea de limpieza automática de mensajes antiguos (12 días)
  startCleanupCron();
});

function startCleanupCron() {
  // Ejecutar cada 12 horas
  setInterval(async () => {
    console.log("🧹 Iniciando proceso de limpieza automática...");
    try {
      const configs = await prisma.agentConfig.findMany({
        where: { deleteMessagesOlderThan12Days: true }
      });

      const twelveDaysAgo = new Date();
      twelveDaysAgo.setDate(twelveDaysAgo.getDate() - 12);

      for (const config of configs) {
        if (!config.tenantId) continue;
        
        // Eliminar mensajes con más de 12 días
        const deletedMsgs = await prisma.message.deleteMany({
          where: { tenantId: config.tenantId, createdAt: { lt: twelveDaysAgo } }
        });
        
        // Eliminar citas/pedidos con más de 12 días
        const deletedApps = await prisma.appointment.deleteMany({
          where: { tenantId: config.tenantId, createdAt: { lt: twelveDaysAgo } }
        });

        // Eliminar contactos (chats) que no tienen mensajes en los últimos 12 días
        // Primero, encontrar contactos del tenant
        const contacts = await prisma.contact.findMany({ where: { tenantId: config.tenantId } });
        let deletedContacts = 0;
        for (const contact of contacts) {
          const recentMsg = await prisma.message.findFirst({
            where: { contactId: contact.id },
            orderBy: { createdAt: 'desc' }
          });
          // Si no tiene mensajes, o su último mensaje es más antiguo que 12 días, lo borramos (esto elimina el chat)
          if (!recentMsg || recentMsg.createdAt < twelveDaysAgo) {
            await prisma.contact.delete({ where: { id: contact.id } });
            deletedContacts++;
          }
        }

        console.log(`🧹 Limpieza para tenant ${config.tenantId}: ${deletedMsgs.count} mensajes, ${deletedApps.count} citas, ${deletedContacts} contactos.`);
      }
    } catch (err) {
      console.error("❌ Error en el proceso de limpieza automática:", err);
    }
  }, 12 * 60 * 60 * 1000); // 12 horas
}
