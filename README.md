# 🤖 ChatbotTech - WhatsApp AI CRM & Asistente Virtual

**Proyecto:** Gestión automatizada de clientes y citas vía WhatsApp

ChatbotTech es una plataforma multi-tenant y asistente virtual inteligente para la administración de interacciones en WhatsApp, permitiendo agendar citas, responder preguntas frecuentes, analizar intenciones con lenguaje natural (LLM) y proporcionar una atención al cliente ininterrumpida y personalizada.

---

## 🚀 Características Principales

### 🕤 Flujo de Agendamiento Inteligente
*   Reserva de citas validando disponibilidad y horarios laborales en tiempo real.
*   Rechazo automático y reprogramación en días cerrados o fuera de servicio.
*   Gestión dinámica y conversacional (evitando formularios rígidos).

### 🔐 Arquitectura Multi-Tenant
*   Soporte simultáneo para múltiples negocios independientes.
*   Cada negocio cuenta con su propio perfil, reglas, portafolio de servicios y FAQs personalizados.
*   "Prompt Maestro" dinámico que muta según la configuración de cada empresa.

### 💰 Procesamiento Inteligente de Mensajes
*   Coalescencia de mensajes rápidos en una única ráfaga (ventana de contexto de 6 segundos).
*   Integración robusta con **Google Gemini** (`3.5-flash` y `2.0-flash`) para NLP avanzado.
*   Transcripción automática de notas de voz a texto.

### 📊 Atención Humana y Multimedia
*   Pausa automática del bot (*Handoff*) ante usuarios frustrados o peticiones explícitas de humano.
*   Envío de catálogos y menús en formato PDF de forma automática si el usuario lo solicita.

---

## 📰 Stack Tecnológico

*   **Backend:** Node.js, Express.js
*   **Integración WhatsApp:** OpenWA (vía contenedor Docker)
*   **Base de Datos:** PostgreSQL
*   **ORM:** Prisma
*   **Inteligencia Artificial:** Google Generative AI (Gemini SDK)

---

## ⚙️ Configuración e Instalación

### Requisitos Previos
*   Node.js v18+
*   Motor de base de datos PostgreSQL
*   Docker (para levantar la API de WhatsApp)

### Instalación

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/chatbottech-whatsapp-crm.git
   cd chatbottech-whatsapp-crm/backend
   ```

2. **Instala dependencias:**
   ```bash
   npm install
   ```

3. **Configura las variables de entorno (`.env`):**
   ```env
   DATABASE_URL="postgresql://usuario:password@localhost:5432/crm_db"
   OPENWA_API_URL="http://localhost:2785/api"
   WEBHOOK_URL="http://tu-dominio.com/webhook/openwa"
   GEMINI_API_KEY_1="tu_api_key_primaria"
   ```

4. **Ejecuta las migraciones de Prisma:**
   ```bash
   npx prisma migrate dev
   ```

5. **Levanta el contenedor de WhatsApp (OpenWA):**
   ```bash
   docker run -d --name openwa-api -p 2785:2785 openwa-openwa
   ```

6. **Ejecuta el entorno de desarrollo:**
   ```bash
   npm run dev
   ```

7. **Abre en el navegador / Postman:**
   El webhook estará escuchando en `http://localhost:3001/webhook/openwa`

---

## 🧪 Scripts disponibles

*   `npm run dev` → Inicia el servidor con nodemon (Desarrollo)
*   `npm start` → Inicia el servidor de producción (`node src/index.js`)
*   `npx prisma studio` → Interfaz gráfica para explorar la base de datos

---

## 📜 Licencia

Este proyecto está bajo licencia MIT.

Desarrollado por **Juan Taguado**  
*Automatizando y optimizando la atención al cliente por WhatsApp.*
