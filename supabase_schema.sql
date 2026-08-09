-- Habilitar extensión para cifrado si no existe (pgcrypto)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabla de Tenants (Negocios) - Limitado a max 3 negocios por ahora
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Usuarios (Administradores/Empleados del panel)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'agent', -- 'admin', 'agent'
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabla de Contactos (Clientes que escriben por WhatsApp)
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    phone VARCHAR(50) NOT NULL, -- Número de WhatsApp
    name VARCHAR(255),
    pipeline_stage VARCHAR(50) DEFAULT 'nuevo', -- nuevo, en_conversacion, cliente, perdido
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, phone)
);

-- 4. Tabla de Mensajes (Historial para el Inbox)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL, -- 'inbound' (del cliente), 'outbound' (del bot/agente)
    content TEXT,
    sender_type VARCHAR(20) NOT NULL, -- 'client', 'bot', 'human'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabla de Citas (Modelo Estándar)
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    service_name VARCHAR(255) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status VARCHAR(50) DEFAULT 'agendada', -- agendada, cancelada, completada
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Configuración del Agente IA (Por Tenant)
CREATE TABLE agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    system_prompt TEXT, -- Instrucciones para el LLM
    is_active BOOLEAN DEFAULT TRUE,
    handoff_requested BOOLEAN DEFAULT FALSE, -- Cuando el bot se pausa esperando humano
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Sesiones de WhatsApp (OpenWA)
CREATE TABLE whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    session_data TEXT, -- Guardaremos el token/estado cifrado aquí si es necesario
    status VARCHAR(50) DEFAULT 'DISCONNECTED', -- CONNECTED, DISCONNECTED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- POLITICAS DE SEGURIDAD (Row Level Security - RLS)

-- Habilitar RLS en todas las tablas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Función de ayuda para obtener el tenant_id del usuario actual
CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS UUID AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Políticas básicas: El usuario solo puede ver y modificar registros de su propio tenant

-- Contacts
CREATE POLICY "Users can view their own tenant contacts" ON contacts FOR SELECT USING (tenant_id = get_current_tenant_id());
CREATE POLICY "Users can insert their own tenant contacts" ON contacts FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY "Users can update their own tenant contacts" ON contacts FOR UPDATE USING (tenant_id = get_current_tenant_id());

-- Messages
CREATE POLICY "Users can view their own tenant messages" ON messages FOR SELECT USING (tenant_id = get_current_tenant_id());
CREATE POLICY "Users can insert their own tenant messages" ON messages FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

-- Appointments
CREATE POLICY "Users can view their own tenant appointments" ON appointments FOR SELECT USING (tenant_id = get_current_tenant_id());
CREATE POLICY "Users can insert their own tenant appointments" ON appointments FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY "Users can update their own tenant appointments" ON appointments FOR UPDATE USING (tenant_id = get_current_tenant_id());
CREATE POLICY "Users can delete their own tenant appointments" ON appointments FOR DELETE USING (tenant_id = get_current_tenant_id());

-- Agent Configs
CREATE POLICY "Users can view their own tenant agent configs" ON agent_configs FOR SELECT USING (tenant_id = get_current_tenant_id());
CREATE POLICY "Users can update their own tenant agent configs" ON agent_configs FOR UPDATE USING (tenant_id = get_current_tenant_id());

-- WhatsApp Sessions
CREATE POLICY "Users can view their own tenant sessions" ON whatsapp_sessions FOR SELECT USING (tenant_id = get_current_tenant_id());
CREATE POLICY "Users can update their own tenant sessions" ON whatsapp_sessions FOR UPDATE USING (tenant_id = get_current_tenant_id());
