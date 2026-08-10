const prisma = require("../lib/prisma");
const { sendTextMessage } = require("./whatsapp");

async function checkAndSendReminders() {
    try {
        const now = new Date();
        const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        
        const pendingAppointments = await prisma.appointment.findMany({
            where: {
                reminderSent: false,
                status: "agendada"
            },
            include: {
                contact: true
            }
        });

        for (const appt of pendingAppointments) {
            const apptDate = new Date(appt.appointmentDate);
            const apptTime = new Date(appt.appointmentTime);
            
            const scheduledDateTime = new Date(
                apptDate.getUTCFullYear(),
                apptDate.getUTCMonth(),
                apptDate.getUTCDate(),
                apptTime.getUTCHours(),
                apptTime.getUTCMinutes(),
                apptTime.getUTCSeconds()
            );

            if (scheduledDateTime <= twoHoursFromNow && scheduledDateTime >= now) {
                if (appt.contact && appt.contact.phone) {
                    const message = `¡Hola ${appt.contact.name || ""}! 👋\n\nEste es un recordatorio de tu cita para el servicio de *${appt.serviceName}* hoy a las *${apptTime.toLocaleTimeString("es-CO", {hour: "2-digit", minute: "2-digit", timeZone: "UTC"})}*.\n\n¡Te esperamos!`;
                    
                    try {
                        await sendTextMessage("default", appt.contact.phone, message);
                        
                        await prisma.appointment.update({
                            where: { id: appt.id },
                            data: { reminderSent: true }
                        });
                        console.log(`Recordatorio enviado a ${appt.contact.phone}`);
                    } catch (e) {
                        console.error(`Error enviando recordatorio a ${appt.contact.phone}:`, e);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error comprobando recordatorios:", error);
    }
}

function startRemindersCron() {
    setInterval(checkAndSendReminders, 60 * 1000);
    console.log("⏰ Motor de recordatorios iniciado.");
}

module.exports = {
    startRemindersCron
};
