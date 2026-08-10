const prisma = require('../lib/prisma');
const { parseIntent, transcribeAudio } = require('./ai');
const axios = require('axios');
const { encrypt } = require('../lib/crypto');

// Configuración de la API del Docker de OpenWA
const OPENWA_API_URL = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
const OPENWA_SESSION = process.env.OPENWA_SESSION || 'default';

let cachedSessionId = null;

async function getActiveSessionId() {
  if (cachedSessionId) return cachedSessionId;
  try {
    const res = await axios.get(`${OPENWA_API_URL}/sessions`, {
      headers: { 'x-api-key': process.env.OPENWA_API_KEY || 'default_api_key' }
    });
    if (Array.isArray(res.data) && res.data.length > 0) {
      const readySession = res.data.find(s => s.status === 'ready') || res.data[0];
      cachedSessionId = readySession.id;
      return cachedSessionId;
    }
  } catch (e) {
    console.error("Error obteniendo sesión activa de OpenWA:", e.message);
  }
  return 'default';
}

async function sendTextMessage(sessionId, to, text) {
  try {
    const targetSession = (sessionId && sessionId !== 'default') ? sessionId : await getActiveSessionId();
    let chatId = to.includes('@') ? to : `${to}@c.us`;
    try {
      await axios.post(`${OPENWA_API_URL}/sessions/${targetSession}/messages/send-text`, {
        chatId: chatId,
        text: text
      }, {
        headers: {
          'x-api-key': process.env.OPENWA_API_KEY || 'default_api_key'
        }
      });
    } catch (primaryErr) {
      if (!to.includes('@')) {
        chatId = `${to}@lid`;
        await axios.post(`${OPENWA_API_URL}/sessions/${targetSession}/messages/send-text`, {
          chatId: chatId,
          text: text
        }, {
          headers: {
            'x-api-key': process.env.OPENWA_API_KEY || 'default_api_key'
          }
        });
      } else {
        throw primaryErr;
      }
    }
  } catch (error) {
    console.error("Error enviando mensaje a OpenWA API:", error.response?.data || error.message);
  }
}

async function sendMediaMessage(sessionId, to, base64Data, filename, caption = '', mimeType = 'image/jpeg') {
  try {
    const targetSession = (sessionId && sessionId !== 'default') ? sessionId : await getActiveSessionId();
    let chatId = to.includes('@') ? to : `${to}@c.us`;
    const effectiveMime = mimeType || 'image/jpeg';
    
    // Obtener el base64 limpio (o descargar si es URL)
    let rawBase64 = base64Data;
    if (typeof base64Data === 'string' && (base64Data.startsWith('http://') || base64Data.startsWith('https://'))) {
      const downloadRes = await axios.get(base64Data, { responseType: 'arraybuffer' });
      rawBase64 = Buffer.from(downloadRes.data).toString('base64');
    } else if (typeof base64Data === 'string' && base64Data.includes('base64,')) {
      rawBase64 = base64Data.split('base64,')[1];
    }

    const isImg = effectiveMime.startsWith('image/');
    const operation = isImg ? 'send-image' : 'send-document';
    const apiUrl = `${OPENWA_API_URL}/sessions/${targetSession}/messages/${operation}`;

    console.log(`📤 Enviando archivo manual vía OpenWA: endpoint=${operation}, filename=${filename}, mime=${effectiveMime}`);

    const payload = {
      chatId: chatId,
      base64: rawBase64,
      mimetype: effectiveMime,
      filename: filename,
      caption: caption
    };

    // Función interna para realizar el POST de manera limpia
    const attemptPost = async (op, targetJid) => {
      const url = `${OPENWA_API_URL}/sessions/${targetSession}/messages/${op}`;
      const body = { ...payload, chatId: targetJid };
      console.log(`📡 Intentando envío: endpoint=${op}, JID=${targetJid}`);
      await axios.post(url, body, {
        headers: {
          'x-api-key': process.env.OPENWA_API_KEY || 'default_api_key'
        }
      });
    };

    try {
      // 1. Intentar el envío primario
      await attemptPost(operation, chatId);
      console.log(`✅ Archivo enviado exitosamente en primer intento (${operation} -> ${chatId})`);
    } catch (err1) {
      console.warn(`⚠️ Primer intento falló (${operation} -> ${chatId}):`, err1.response?.data || err1.message);

      // Fallback A: Si era una imagen y falló, intentar como documento a c.us
      if (operation === 'send-image') {
        try {
          await attemptPost('send-document', chatId);
          console.log(`✅ Imagen enviada exitosamente como documento a ${chatId}`);
          return;
        } catch (errDoc) {
          console.warn(`⚠️ Fallback de documento a c.us también falló:`, errDoc.response?.data || errDoc.message);
        }
      }

      // Fallback B: Si el JID era c.us y no tiene @ en la entrada original, intentar con LID
      if (!to.includes('@')) {
        const lidJid = `${to}@lid`;
        try {
          // Intentar el tipo original a LID
          await attemptPost(operation, lidJid);
          console.log(`✅ Archivo enviado exitosamente a LID (${operation} -> ${lidJid})`);
          return;
        } catch (err2) {
          console.warn(`⚠️ Intento LID falló (${operation} -> ${lidJid}):`, err2.response?.data || err2.message);
          
          // Si era imagen y falló a LID, intentar como documento a LID
          if (operation === 'send-image') {
            try {
              await attemptPost('send-document', lidJid);
              console.log(`✅ Imagen enviada exitosamente como documento a LID ${lidJid}`);
              return;
            } catch (err3) {
              console.error(`❌ Todos los intentos fallaron (incluyendo fallbacks a LID y documento)`);
              throw err3;
            }
          }
          throw err2;
        }
      }
      throw err1;
    }
  } catch (error) {
    console.error("❌ Error definitivo enviando archivo a OpenWA API:", error.response?.data || error.message);
  }
}



const messageQueues = {};
const processingLocks = new Set(); // Evitar procesamiento doble

async function processCoalescedMessages(phone, contactId, from, sessionId, combinedBody) {
    // Guard de idempotencia: si ya estamos procesando este teléfono, ignorar
    if (processingLocks.has(phone)) {
        console.log(`⚠️ Procesamiento ya en curso para ${phone}, ignorando duplicado.`);
        return;
    }
    processingLocks.add(phone);

    try {
        console.log(`Procesando ráfaga combinada para ${phone}: ${combinedBody}`);
        
        // Verificar si el bot está pausado para este contacto (por handoff O por timer)
        const contact = await prisma.contact.findUnique({ where: { id: contactId } });
        const isBotPausedByTimer = contact?.botPausedUntil && new Date() < new Date(contact.botPausedUntil);
        if (contact?.pipelineStage === 'handoff' || isBotPausedByTimer) {
            console.log(`Bot ignorando procesamiento para ${phone} porque está en pausa (handoff/timer)`);
            processingLocks.delete(phone);
            return;
        }

        // 3. Obtener configuración del negocio para lógica específica
        const agentConfig = await prisma.agentConfig.findUnique({ where: { tenantId: contact?.tenantId } });

        // 4. Pasar a Gemini para entender intención
        const aiResponse = await parseIntent(combinedBody, contactId, null, contact?.tenantId);
        console.log("Intención detectada:", aiResponse);

        // 4. Lógica de respuesta (Directa de Gemini)
        let replyText = aiResponse.reply_text || "No entendí muy bien, ¿te gustaría agendar una cita?";

        // Si detectamos hostilidad o petición de humano, pausamos el bot
        if (aiResponse.intent === 'transferir_humano') {
            await prisma.contact.update({
                where: { id: contactId },
                data: { pipelineStage: 'handoff' }
            });
            console.log(`Bot pausado para ${phone} (Handoff)`);
        }

        // Si detectamos cita con datos completos, guardamos en base de datos
        if (aiResponse.intent === 'crear_cita' && aiResponse.parameters.fecha_solicitada && aiResponse.parameters.hora_solicitada) {
            try {
                // Actualizar nombre del contacto si fue proporcionado
                if (aiResponse.parameters.nombre_paciente) {
                    await prisma.contact.update({
                        where: { id: contactId },
                        data: { name: aiResponse.parameters.nombre_paciente }
                    });
                }

                await prisma.appointment.create({
                    data: {
                        tenantId: contact?.tenantId,
                        contactId: contactId,
                        serviceName: aiResponse.parameters.servicio_solicitado || "Consulta general",
                        appointmentDate: new Date(aiResponse.parameters.fecha_solicitada),
                        appointmentTime: new Date(`1970-01-01T${aiResponse.parameters.hora_solicitada}Z`)
                    }
                });
                
                const isPedido = agentConfig?.businessType === 'pedidos';
                await prisma.contact.update({
                    where: { id: contactId },
                    data: { pipelineStage: isPedido ? 'handoff' : 'agendada' }
                });
                console.log(`${isPedido ? 'Pedido' : 'Cita'} guardada en BD para ${phone}`);
            } catch (err) {
                console.error("Error guardando cita:", err);
            }
        }

        // Si detectamos actualización de cita, modificamos la más reciente
        if (aiResponse.intent === 'actualizar_cita' && aiResponse.parameters.nueva_fecha && aiResponse.parameters.nueva_hora) {
            try {
                const latestAppointment = await prisma.appointment.findFirst({
                    where: { contactId: contactId, status: 'agendada' },
                    orderBy: { createdAt: 'desc' }
                });
                
                if (latestAppointment) {
                    await prisma.appointment.update({
                        where: { id: latestAppointment.id },
                        data: {
                            appointmentDate: new Date(aiResponse.parameters.nueva_fecha),
                            appointmentTime: new Date(`1970-01-01T${aiResponse.parameters.nueva_hora}Z`),
                            reminderSent: false
                        }
                    });
                    console.log(`Cita actualizada en BD para ${phone}`);
                }
            } catch (err) {
                console.error("Error actualizando cita:", err);
            }
        }

        // Si detectamos cancelación de cita, se elimina directamente de la base de datos
        if (aiResponse.intent === 'cancelar_cita') {
            try {
                const latestAppointment = await prisma.appointment.findFirst({
                    where: { contactId: contactId },
                    orderBy: { createdAt: 'desc' }
                });
                
                if (latestAppointment) {
                    await prisma.appointment.delete({
                        where: { id: latestAppointment.id }
                    });
                    console.log(`🗑️ Cita eliminada físicamente de BD para ${phone}`);
                }
            } catch (err) {
                console.error("Error eliminando cita de la BD:", err);
            }
        }

        // Si detectamos actualización de datos del cliente (nombre)
        if (aiResponse.intent === 'actualizar_datos_cliente' && aiResponse.parameters.nombre_paciente) {
            try {
                await prisma.contact.update({
                    where: { id: contactId },
                    data: { name: aiResponse.parameters.nombre_paciente }
                });
                console.log(`Nombre del contacto actualizado en BD para ${phone}`);
            } catch (err) {
                console.error("Error actualizando nombre:", err);
            }
        }

        // 5. Si la intención es enviar carta/PDF: verificar ANTES si existe el archivo
        //    para enviar el texto correcto según el caso
        if (aiResponse.intent === 'enviar_carta_o_catalogo') {
            try {
                const agentConfig = await prisma.agentConfig.findUnique({
                    where: { tenantId: contact?.tenantId }
                });

                const pdfSource = agentConfig?.menuPdfBase64 || agentConfig?.menuPdfUrl;
                const pdfName = agentConfig?.menuPdfName || 'Carta_Menu.pdf';

                if (pdfSource) {
                    // Hay PDF → enviar el texto de Gemini y luego el archivo
                    await sendTextMessage(sessionId, from, replyText);
                    console.log(`📄 Enviando archivo PDF de la carta/menú a ${phone} (${pdfName})...`);
                    await sendMediaMessage(
                        sessionId,
                        from,
                        pdfSource,
                        pdfName,
                        '',
                        'application/pdf'
                    );

                    // Registrar en BD: texto + chip de PDF
                    await prisma.message.create({
                        data: {
                            tenantId: contact?.tenantId,
                            contactId: contactId,
                            direction: 'outbound',
                            content: encrypt(replyText),
                            senderType: 'bot'
                        }
                    });
                    await prisma.message.create({
                        data: {
                            tenantId: contact?.tenantId,
                            contactId: contactId,
                            direction: 'outbound',
                            content: encrypt(`[📄 ${pdfName}]`),
                            senderType: 'bot'
                        }
                    });
                } else {
                    // No hay PDF → responder amablemente que no lo tenemos
                    const noPdfMsg = 'Por el momento no contamos con una carta o menú en PDF disponible. Si tienes alguna pregunta sobre nuestros servicios o precios, con gusto te ayudo. 😊';
                    await sendTextMessage(sessionId, from, noPdfMsg);
                    console.log(`ℹ️ [PDF INFO] El cliente ${phone} pidió la carta, pero no hay PDF configurado.`);

                    await prisma.message.create({
                        data: {
                            tenantId: contact?.tenantId,
                            contactId: contactId,
                            direction: 'outbound',
                            content: encrypt(noPdfMsg),
                            senderType: 'bot'
                        }
                    });
                }
            } catch (pdfErr) {
                console.error("Error enviando PDF de carta/menú:", pdfErr);
                // Si algo falla, enviar el texto original como fallback
                await sendTextMessage(sessionId, from, replyText);
            }
        } else {
            // 5b. Para cualquier otra intención, enviar respuesta normalmente
            await sendTextMessage(sessionId, from, replyText);

            // 7. Guardar la respuesta en BD
            await prisma.message.create({
                data: {
                    tenantId: contact?.tenantId,
                    contactId: contactId,
                    direction: 'outbound',
                    content: encrypt(replyText),
                    senderType: 'bot'
                }
            });
        }
    } catch (error) {
        console.error("Error procesando ráfaga de mensajes:", error);
    } finally {
        processingLocks.delete(phone);
    }
}

async function resolveTenantFromWebhookPayload(payload) {
  const possibleSessionIds = [
    payload.sessionId,
    payload.session,
    payload.name,
    payload.data?.sessionId,
    payload.data?.session,
    payload.data?.name
  ].filter(Boolean);

  for (const sessId of possibleSessionIds) {
    if (typeof sessId !== 'string') continue;

    // 1. Si el identificador tiene formato 'tenant-XXXXXXXX'
    const tenantMatch = sessId.match(/tenant-([a-f0-9]{8})/i);
    if (tenantMatch && tenantMatch[1]) {
      const prefix = tenantMatch[1].toLowerCase();
      const allTenants = await prisma.tenant.findMany();
      const tenant = allTenants.find(t => t.id.toLowerCase().startsWith(prefix));
      if (tenant) {
        console.log(`✅ [WEBHOOK] Tenant resuelto por prefijo '${prefix}' -> ID: ${tenant.id} (${tenant.name})`);
        return tenant.id;
      }
    }

    // 2. Buscar por whatsappSession.id exacto
    try {
      const ws = await prisma.whatsappSession.findUnique({
        where: { id: sessId }
      });
      if (ws?.tenantId) {
        console.log(`✅ [WEBHOOK] Tenant resuelto por whatsappSession.id -> ID: ${ws.tenantId}`);
        return ws.tenantId;
      }
    } catch (_) {}

    // 3. Buscar en sessionData conteniendo el sessId
    try {
      const allWs = await prisma.whatsappSession.findMany();
      console.log(`[DEBUG WEBHOOK] Buscando sessId: '${sessId}' en ${allWs.length} sesiones`);
      const wsData = allWs.find(ws => {
        const matches = ws.sessionData && ws.sessionData.includes(sessId);
        console.log(`[DEBUG WEBHOOK] Comparando con sessionData: ${ws.sessionData} -> Coincide: ${matches}`);
        return matches;
      });
      if (wsData?.tenantId) {
        console.log(`✅ [WEBHOOK] Tenant resuelto por sessionData '${sessId}' -> ID: ${wsData.tenantId}`);
        return wsData.tenantId;
      }
    } catch (e) {
      console.warn("Error buscando tenant en sessionData", e.message);
    }
  }

  return null;
}

async function handleWebhook(payload) {
  // Manejar el formato de webhook de rmyndharis/OpenWA
  const eventType = payload.event;
  if (eventType && eventType !== 'message.received' && eventType !== 'message.ack' && eventType !== 'message.create') return;

  const messageData = payload.data || payload;

  // Ignorar estados o grupos
  if (messageData.isGroup || messageData.isStatus) return;

  let from = messageData.from || messageData.remoteJid;
  if (messageData.fromMe && (messageData.to || messageData.chatId)) {
    from = messageData.to || messageData.chatId;
  }
  if (!from) return;

  const author = messageData.author || messageData.sender;
  const realAuthorId = typeof author === 'string' ? author : (author?.id || author?.jid);
  
  if (from.includes('@lid') && realAuthorId && !realAuthorId.includes('@lid')) {
      from = realAuthorId;
  }

  // Resolver tenantId y comprobar si está suspendido
  const resolvedTenantId = await resolveTenantFromWebhookPayload(payload);

  if (!resolvedTenantId) {
    console.warn(`🚫 [WEBHOOK RECHAZADO] Imposible asociar el mensaje entrante a un negocio (Tenant) registrado. Sesiones en payload:`, payload.sessionId || payload.session || payload.name);
    return;
  }

  const tenantObj = await prisma.tenant.findUnique({
    where: { id: resolvedTenantId }
  });

  if (!tenantObj || !tenantObj.isActive) {
    console.log(`🚫 [WEBHOOK ABORTADO] El negocio (tenant_id: ${resolvedTenantId}) está suspendido o inactivo.`);
    return;
  }

  const contactData = messageData.contact || payload.data?.contact || null;
  let phone = from.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
  const isLid = phone.length > 13 || from.includes('@lid');

  if (isLid) {
    const rawNumber = contactData?.number || contactData?.phone || '';
    const cleanNumber = rawNumber.replace(/\D/g, '');
    if (cleanNumber && cleanNumber.length >= 7 && cleanNumber.length <= 15) {
      phone = cleanNumber;
    } else if (contactData?.id) {
      const cid = typeof contactData.id === 'string' ? contactData.id : (contactData.id?._serialized || '');
      if (cid.includes('@c.us') || cid.includes('@s.whatsapp.net')) {
        phone = cid.replace(/@c\.us|@s\.whatsapp\.net/g, '').replace(/\D/g, '');
      }
    }

    // Intento 3: Si sigue siendo un LID (>13 dígitos), consultar la API de OpenWA directamente
    if (phone.length > 13 || from.includes('@lid')) {
      try {
        const owaSessionId = payload.sessionId || payload.session || payload.name || 'default';
        const lidJid = from.includes('@') ? from : `${from}@lid`;
        const apiUrl = `${OPENWA_API_URL}/sessions/${encodeURIComponent(owaSessionId)}/contacts/${encodeURIComponent(lidJid)}`;
        
        const resp = await axios.get(apiUrl, {
          headers: { 'x-api-key': process.env.OPENWA_API_KEY || 'default_api_key' },
          timeout: 4000
        }).catch(() => null);

        const contactInfo = resp?.data;
        if (contactInfo?.id) {
          const idStr = typeof contactInfo.id === 'string' ? contactInfo.id : (contactInfo.id?.user || '');
          if (idStr.includes('@c.us')) {
            const resolvedNumber = idStr.replace('@c.us', '').replace(/\D/g, '');
            if (resolvedNumber && resolvedNumber.length >= 7 && resolvedNumber.length <= 15) {
              phone = resolvedNumber;
              console.log(`✅ [LID RESOLVER] LID ${from} resuelta a número real: +${phone}`);
            }
          }
        }
      } catch (lidErr) {
        console.warn(`⚠️ Error resolviendo LID vía OpenWA:`, lidErr.message);
      }
    }
  }

  let body = messageData.body || messageData.text || messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';

  // Si el mensaje fue enviado por el humano directamente desde el teléfono (fromMe === true)
  if (messageData.fromMe) {
    if (!body.trim()) return;
    try {
      const cleanDigits = phone.slice(-10);
      let contact = await prisma.contact.findFirst({
        where: {
          tenantId: resolvedTenantId,
          OR: [
            { phone: { endsWith: cleanDigits } },
            { phone: phone }
          ]
        }
      });
      if (contact) {
        const existingMsg = await prisma.message.findFirst({
          where: {
            contactId: contact.id,
            tenantId: resolvedTenantId,
            direction: 'outbound',
            createdAt: { gte: new Date(Date.now() - 5000) }
          }
        });
        if (!existingMsg) {
          await prisma.message.create({
            data: {
              tenantId: resolvedTenantId,
              contactId: contact.id,
              direction: 'outbound',
              content: encrypt(body),
              senderType: 'human'
            }
          });
          console.log(`💬 Mensaje enviado desde el teléfono guardado en CRM para ${phone} (Tenant: ${resolvedTenantId})`);
        }
      }
    } catch (err) {
      console.error("Error guardando mensaje fromMe en CRM:", err);
    }
    return;
  }

  const senderName = messageData.pushName || messageData.sender?.pushname || 'Cliente';

  // Detección y transcripción automática de notas de voz / audios
  const isAudio = messageData.type === 'audio' || messageData.type === 'ptt' || messageData.type === 'voice' || messageData.mimetype?.includes('audio') || messageData.message?.audioMessage;
  
  if (isAudio) {
    try {
      let audioBase64 = payload.metadata?.media?.data || payload.data?.metadata?.media?.data || messageData.metadata?.media?.data || messageData.mediaData?.data || (typeof messageData.body === 'string' && messageData.body.length > 100 ? messageData.body : '');
      const audioMime = payload.metadata?.media?.mimetype || messageData.metadata?.media?.mimetype || messageData.mimetype || 'audio/ogg';

      if (audioBase64) {
        console.log(`🎙️ Nota de voz obtenida de ${phone}, transcribiendo con Gemini (${audioMime})...`);
        const transcribedText = await transcribeAudio(audioBase64, audioMime);
        if (transcribedText) {
          body = `[🎙️ Nota de voz]: ${transcribedText}`;
        } else {
          body = `[🎙️ Nota de voz no transcribible]`;
        }
      } else {
        body = `[🎙️ Nota de voz]`;
      }
    } catch (audioErr) {
      console.error("Error al procesar nota de voz:", audioErr.message);
      body = `[🎙️ Nota de voz]`;
    }
  }

  if (!body.trim()) return;

  console.log(`📩 Mensaje procesando para Tenant ${resolvedTenantId} | De: ${phone}: "${body}"`);

  try {
    // 1. Registrar o encontrar el contacto (usando los últimos dígitos para evitar fragmentación por ID de WhatsApp)
  const cleanDigits = phone.slice(-10);
  let contact = await prisma.contact.findFirst({
      where: {
        tenantId: resolvedTenantId,
        OR: [
          { phone: { endsWith: cleanDigits } },
          { phone: phone }
        ]
      }
  });

    if (!contact) {
        contact = await prisma.contact.create({
            data: { 
                tenantId: resolvedTenantId,
                phone, 
                name: senderName !== 'Cliente' ? senderName : undefined 
            }
        });
        console.log(`✅ Contacto creado con phone: ${phone} (Tenant: ${resolvedTenantId})`);
    } else if (contact.phone !== phone && contact.phone.replace(/\D/g, '').length > 13) {
        // El contacto tenía un LID guardado — actualizarlo con el número real
        contact = await prisma.contact.update({
            where: { id: contact.id },
            data: { phone }
        });
        console.log(`🔄 Contacto actualizado: LID ${contact.phone} → número real: ${phone}`);
    }

    // 2. Guardar mensaje entrante de inmediato (para el Inbox UI)
    await prisma.message.create({
        data: {
            tenantId: resolvedTenantId,
            contactId: contact.id,
            direction: 'inbound',
            content: encrypt(body),
            senderType: 'client'
        }
    });

    // 3. Comprobar si el bot está activado GLOBALMENTE para este negocio en Configuración
    if (resolvedTenantId) {
      const agentConfig = await prisma.agentConfig.findUnique({
        where: { tenantId: resolvedTenantId }
      });

      if (agentConfig && agentConfig.isActive === false) {
        console.log(`🤖⛔ [BOT GLOBAL DESACTIVADO] El bot está apagado globalmente en Configuración para el negocio (${resolvedTenantId}). Mensaje guardado en Inbox pero el bot NO responderá.`);
        return;
      }
    }

    // 4. Comprobar si el bot está en pausa INDIVIDUAL para este chat (Handoff o temporizador activo)
    const isBotPausedByTimer = contact.botPausedUntil && new Date(contact.botPausedUntil) > new Date();
    if (contact.pipelineStage === 'handoff' || isBotPausedByTimer) {
        console.log(`⏸️ [BOT PAUSADO CHAT] Bot ignorando mensaje de ${phone} porque está en pausa para este chat (handoff/timer)`);
        return;
    }

    // COALESCENCE LOGIC
    if (!messageQueues[phone]) {
        messageQueues[phone] = {
            combinedBody: body,
            timeout: null
        };
    } else {
        messageQueues[phone].combinedBody += `\n${body}`;
        clearTimeout(messageQueues[phone].timeout);
    }

    const sessionId = payload.sessionId || OPENWA_SESSION;

    messageQueues[phone].timeout = setTimeout(() => {
        const finalBody = messageQueues[phone]?.combinedBody;
        delete messageQueues[phone];
        if (finalBody?.trim()) {
            processCoalescedMessages(phone, contact.id, from, sessionId, finalBody);
        }
    }, 6000); // Esperar 6 segundos para acumular ráfagas rápidas de un mismo usuario

  } catch (error) {
    console.error("Error procesando mensaje en webhook:", error);
  }
}

module.exports = {
  handleWebhook,
  sendTextMessage,
  sendMediaMessage
};
