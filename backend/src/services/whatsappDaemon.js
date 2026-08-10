const axios = require('axios');
const prisma = require('../lib/prisma');

const OPENWA_URL = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
const OWA_KEY = 'owa_k1_342430d11a4dc3573f73bf941ce0686676af09a8f29208cf50c12251eb32c1f9';

/**
 * Servicio demonio autónomo que garantiza que las conexiones de WhatsApp
 * estén permanentemente sincronizadas y escuchando webhooks 24/7,
 * sin depender de si el usuario tiene el frontend abierto o cerrado.
 */
async function syncWhatsappSessions() {
  try {
    // 1. Obtener lista de todas las sesiones activas en el Docker de OpenWA
    const listRes = await axios.get(`${OPENWA_URL}/sessions`, {
      headers: { 'x-api-key': OWA_KEY },
      timeout: 5000
    }).catch(() => null);

    if (!listRes || !Array.isArray(listRes.data)) return;

    const openwaSessions = listRes.data;

    // 2. Procesar cada sesión de OpenWA
    for (const owaSess of openwaSessions) {
      const isConnected = ['ready', 'WORKING', 'inChat', 'authenticated', 'isLogged', 'connected'].includes(owaSess.status);

      // Extraer el prefijo del tenant del nombre de la sesión (ej. tenant-b9d912c8)
      let tenant = null;
      if (owaSess.name && owaSess.name.startsWith('tenant-')) {
        const prefix = owaSess.name.replace('tenant-', '').toLowerCase();
        const allTenants = await prisma.tenant.findMany();
        tenant = allTenants.find(t => t.id.toLowerCase().startsWith(prefix)) || null;
      }

      if (!tenant) {
        // Intentar buscar tenant por sesión previa guardada en DB
        const dbSess = await prisma.whatsappSession.findFirst({
          where: {
            OR: [
              { id: owaSess.id },
              { sessionData: { contains: owaSess.id } },
              { sessionData: { contains: owaSess.name } }
            ]
          },
          include: { tenant: true }
        });
        if (dbSess?.tenant) {
          tenant = dbSess.tenant;
        }
      }

      if (!tenant) continue;

      if (isConnected) {
        const phoneVal = owaSess.phone ? `+${owaSess.phone}` : '+573148665535';
        const pushNameVal = owaSess.pushName || tenant.name;
        const sessionDataStr = JSON.stringify({
          phone: phoneVal,
          pushName: pushNameVal,
          sessionName: owaSess.name,
          owaSessionId: owaSess.id
        });

        // 3. Garantizar suscripción activa al Webhook en OpenWA
        try {
          const webhookUrl = process.env.WEBHOOK_URL || 'http://host.docker.internal:3001/webhook/openwa';
          const webhooksRes = await axios.get(`${OPENWA_URL}/sessions/${owaSess.id}/webhooks`, {
            headers: { 'x-api-key': OWA_KEY },
            timeout: 3000
          }).catch(() => null);

          const existingWebhooks = webhooksRes?.data || [];
          const hasWebhook = existingWebhooks.some(w => (w.url === webhookUrl || w.url?.includes('/webhook/openwa')) && w.active !== false);

          if (!hasWebhook) {
            await axios.post(`${OPENWA_URL}/sessions/${owaSess.id}/webhooks`, {
              url: webhookUrl,
              events: ['*']
            }, {
              headers: { 'x-api-key': OWA_KEY },
              timeout: 3000
            }).catch(() => null);
            console.log(`📡 [DAEMON] Webhook suscrito para '${tenant.name}' (${owaSess.name}) -> ${webhookUrl}`);
          }
        } catch (whErr) {
          console.warn(`Advertencia suscribiendo webhook en demonio para '${tenant.name}':`, whErr.message);
        }

        // 4. Actualizar estado en la base de datos a CONNECTED
        await prisma.whatsappSession.upsert({
          where: { tenantId: tenant.id },
          update: {
            status: 'CONNECTED',
            sessionData: sessionDataStr,
            updatedAt: new Date()
          },
          create: {
            tenantId: tenant.id,
            status: 'CONNECTED',
            sessionData: sessionDataStr
          }
        });
      } else if (owaSess.status === 'disconnected' || owaSess.status === 'closed') {
        // Actualizar a DISCONNECTED en la base de datos si OpenWA reporta la sesión como cerrada
        await prisma.whatsappSession.updateMany({
          where: { tenantId: tenant.id },
          data: { status: 'DISCONNECTED', updatedAt: new Date() }
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("Error en demonio autónomo de WhatsApp:", err.message);
  }
}

/**
 * Inicia el temporizador en segundo plano del demonio (corre cada 15 segundos)
 */
function startWhatsappDaemon() {
  console.log("⚡ [DAEMON] Demonio autónomo de WhatsApp iniciado (Frecuencia: 15s).");
  
  // Ejecución inicial inmediata
  syncWhatsappSessions();

  // Ejecución periódica cada 15 segundos
  setInterval(syncWhatsappSessions, 15000);
}

module.exports = {
  startWhatsappDaemon,
  syncWhatsappSessions
};
