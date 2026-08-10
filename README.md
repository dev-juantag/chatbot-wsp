# 🤖 Chatbot CRM — WhatsApp + IA

Sistema CRM empresarial con chatbot de WhatsApp impulsado por inteligencia artificial (Google Gemini). Permite gestionar conversaciones, citas/pedidos, contactos y la configuración del bot desde un dashboard web multi-tenant.

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Stack Tecnológico](#-stack-tecnológico)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Variables de Entorno](#-variables-de-entorno)
- [Módulos del Sistema](#-módulos-del-sistema)
- [Roles y Permisos](#-roles-y-permisos)
- [Despliegue](#-despliegue)

---

## ✨ Características

- 💬 **Chatbot WhatsApp con IA** — Responde automáticamente usando Google Gemini, con memoria de conversación y contexto del negocio.
- 🏢 **Multi-tenant** — Múltiples negocios en una sola instancia, cada uno con su propia configuración, sesión de WhatsApp y datos.
- 📅 **Gestión de Citas/Pedidos** — El bot agenda citas o toma pedidos automáticamente y los registra en el CRM.
- 👥 **CRM de Contactos** — Historial completo de cada cliente con pipeline de stages.
- 🔄 **Control del Bot por Chat** — Activar, pausar 5h, o apagar el bot individualmente por conversación.
- 🚨 **Handoff Humano** — El bot detecta cuando un cliente necesita atención humana y notifica con indicador en el sidebar.
- ⚙️ **Configuración Dinámica** — Nombre, personalidad, horarios, servicios, FAQs y PDF de menú configurables por negocio.
- 🔒 **Gestión de Licencias** — El superadmin puede suspender/reactivar negocios; los usuarios ven pantalla de licencia suspendida.
- 📊 **Panel de Superadmin** — Control global de todos los negocios y usuarios del sistema.
- 🗑️ **Auto-limpieza** — Opción de eliminar mensajes, chats y citas mayores a 12 días para mantener la BD liviana.
- 🔐 **Autenticación con Supabase** — Login seguro con JWT, soporte para múltiples roles.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                   Cliente (Navegador)                    │
│              Next.js 15 — chatbot.techtag.dev            │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS (Cloudflare Tunnel)
┌──────────────────────▼──────────────────────────────────┐
│              Frontend Next.js (Puerto 3000)              │
│  • App Router + TypeScript                               │
│  • Supabase Auth (sesiones de usuario)                   │
│  • Proxy /api/backend/* → localhost:3001                 │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP interno
┌──────────────────────▼──────────────────────────────────┐
│              Backend Express (Puerto 3001)               │
│  • API REST + authMiddleware JWT                         │
│  • Prisma ORM → PostgreSQL (Supabase)                    │
│  • Google Gemini AI                                      │
│  • Integración OpenWA (gestión de sesiones WA)           │
└──────────────┬────────────────────┬────────────────────-┘
               │                    │
┌──────────────▼──────┐  ┌──────────▼──────────────────┐
│ PostgreSQL (Supabase)│  │  OpenWA (Puerto 2785)        │
│ • Datos multi-tenant │  │  • Sesiones de WhatsApp      │
│ • Row Level Security │  │  • QR / Estado / Webhooks    │
└─────────────────────┘  └──────────────────────────────┘
```

Flujo de mensajes WhatsApp:
```
Usuario WA → OpenWA Webhook → Backend Express → Google Gemini → Respuesta WA
                                    │
                              Guarda en DB
                              (Mensajes, Citas, Contactos)
```

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | Next.js 15 (App Router), TypeScript, TailwindCSS |
| **Backend** | Node.js, Express.js |
| **ORM** | Prisma v7 |
| **Base de Datos** | PostgreSQL vía Supabase |
| **Autenticación** | Supabase Auth (JWT) |
| **IA** | Google Gemini API |
| **WhatsApp** | OpenWA (contenedor Docker) |
| **Tunnel** | Cloudflare Tunnel |
| **UI Components** | Lucide React |

---

## 📁 Estructura del Proyecto

```
bot/
├── backend/                    # Servidor Express + API
│   ├── prisma/
│   │   └── schema.prisma       # Modelos de base de datos
│   ├── src/
│   │   ├── index.js            # Punto de entrada, todas las rutas API
│   │   ├── lib/
│   │   │   ├── auth.js         # Middleware de autenticación JWT
│   │   │   ├── crypto.js       # Cifrado de API keys
│   │   │   └── prisma.js       # Cliente Prisma singleton
│   │   └── services/
│   │       ├── ai.js           # Integración Google Gemini + parseIntent
│   │       ├── reminders.js    # Servicio de recordatorios de citas
│   │       ├── whatsapp.js     # Lógica de envío de mensajes WA
│   │       └── whatsappDaemon.js # Daemon de monitoreo de sesiones
│   └── package.json
│
├── frontend/                   # Aplicación Next.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/
│   │   │   │   ├── layout.tsx              # Sidebar, auth check, licencia
│   │   │   │   ├── page.tsx                # Vista de Chats (principal)
│   │   │   │   ├── appointments/page.tsx   # Citas / Pedidos
│   │   │   │   ├── contacts/page.tsx       # Contactos CRM
│   │   │   │   ├── lab/page.tsx            # Simulador de chatbot
│   │   │   │   ├── settings/               # Configuración del negocio
│   │   │   │   ├── superadmin/page.tsx     # Panel control global
│   │   │   │   ├── users/page.tsx          # Gestión de asesores
│   │   │   │   └── whatsapp/page.tsx       # Conexión WhatsApp + QR
│   │   │   ├── login/page.tsx              # Inicio de sesión
│   │   │   └── api/                        # API Routes Next.js (proxy)
│   │   └── lib/
│   │       ├── supabase.ts                 # Cliente Supabase
│   │       └── crypto.ts                   # Utilidades de cifrado
│   ├── next.config.ts                      # Proxy rewrites → backend
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## 🚀 Instalación y Configuración

### Requisitos previos

- Node.js v20+
- Docker Desktop (para OpenWA)
- Cuenta Supabase (base de datos + auth)
- Cuenta Google AI Studio (API Key Gemini)
- Cuenta Cloudflare (para el tunnel público)

### 1. Clonar el repositorio

```bash
git clone https://github.com/dev-juantag/chatbot-wsp.git
cd chatbot-wsp
```

### 2. Configurar el Backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales

npx prisma generate
npx prisma db push
```

### 3. Configurar el Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Editar .env.local con tus credenciales

npm run build
```

### 4. Iniciar OpenWA (Docker)

```bash
docker run -d -p 2785:2785 \
  -e OWA_API_KEY=tu_api_key \
  --name openwa \
  openwa/wa-automate
```

### 5. Arrancar todo

Ejecutar `iniciar_chatbot.bat` (Windows) para iniciar simultáneamente:
- Cloudflare Tunnel
- Backend Express (puerto 3001)
- Frontend Next.js en producción (puerto 3000)

---

## 🔑 Variables de Entorno

### Backend (`backend/.env`)

```env
DATABASE_URL="postgresql://..."
SUPABASE_URL="https://xxxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
GEMINI_API_KEY="AIza..."
OPENWA_API_URL="http://localhost:2785/api"
OPENWA_API_KEY="owa_k1_..."
WEBHOOK_URL="http://host.docker.internal:3001/webhook/openwa"
ENCRYPTION_KEY="clave_aleatoria_32_chars"
JWT_SECRET="tu_jwt_secret"
PORT=3001
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
```

---

## 📦 Módulos del Sistema

### 💬 Chats
Vista principal. Conversaciones de WhatsApp en tiempo real con:
- Control por chat: **Activo / Pausado 5h / Apagado**
- Indicador de handoff (punto rojo) en sidebar cuando un cliente necesita atención humana
- Historial completo de mensajes

### 📅 Citas / Pedidos
- El bot agenda automáticamente
- Confirmar (✓) o cancelar (✗) desde el CRM
- Filtros por estado

### 👥 Contactos
- Pipeline de stages (Nuevo → Activo → Handoff → Cerrado)
- Búsqueda por nombre, teléfono o email

### ⚙️ Configuración
- Nombre, tipo de negocio, horarios
- Servicios/Productos que el bot conoce
- FAQs automáticas
- Menú PDF
- API Key personalizada de Gemini
- **Auto-limpieza**: eliminar datos con más de 12 días

### 🔬 Simulador Chatbot
Prueba el bot antes de que interactúe con clientes reales.

### 📡 Conexión WhatsApp
- Genera y muestra código QR automáticamente
- Polling cada 6s para detectar el escaneo en vivo
- Estado: Iniciando → QR listo → Conectado

### 🛡️ Panel Superadmin
- Crear/gestionar negocios (tenants)
- Activar / **Suspender licencias** (usuarios bloqueados hasta reactivación)
- Gestión global de usuarios

---

## 👤 Roles y Permisos

| Rol | Descripción | Accesos |
|---|---|---|
| `superadmin` | Administrador global | Todo: negocios, usuarios, reportes globales |
| `admin` | Admin de un negocio | Su negocio: config, usuarios, reportes |
| `agent` | Asesor/empleado | Chats, citas y contactos de su negocio |

---

## 🌐 Despliegue

| Servicio | URL / Puerto |
|---|---|
| Frontend producción | chatbot.techtag.dev (puerto 3000) |
| Backend API | localhost:3001 (via proxy Next.js) |
| OpenWA | localhost:2785 |

El frontend actúa como proxy transparente: `/api/backend/*` → `http://localhost:3001`. Esto evita CORS y problemas de certificados SSL.

**Base de datos:** Supabase PostgreSQL managed, con Row Level Security habilitado en todas las tablas. Migraciones con `npx prisma db push`.

---

## 📄 Licencia

Propiedad de **Juan Taguado / TechTag**. Todos los derechos reservados.

---

*Desarrollado con ❤️ por [Juan Taguado](https://github.com/dev-juantag)*
