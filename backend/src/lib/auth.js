const axios = require('axios');
const prisma = require('./prisma');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Falta cabecera de autorización' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://ssmmjezafbtopkpwmazz.supabase.co';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_7f37Fo0mJkLV9U6H31cFzw_Orr5h-E7';

    // Validar token contra Supabase Auth API
    const authRes = await axios.get(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseAnonKey
      }
    });

    const supabaseUser = authRes.data;
    if (!supabaseUser || !supabaseUser.id) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Buscar el usuario en nuestra BD
    let user = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
      include: { tenant: true }
    });

    console.log(`🔐 [AUTH] ID: ${supabaseUser.id} | Email: ${supabaseUser.email} | DB: ${user ? 'Encontrado' : 'No Encontrado'}`);
    if (user) {
      console.log(`👤 [USER] Role: ${user.role} | Active: ${user.isActive} | TenantId: ${user.tenantId}`);
    }

    // Onboarding automático si existe en Supabase pero aún no en la tabla local
    if (!user) {
      const userRole = supabaseUser.user_metadata?.role || 'agent';
      const userTenantId = supabaseUser.user_metadata?.tenant_id || null;
      
      user = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: supabaseUser.email,
          role: userRole,
          tenantId: userTenantId ? userTenantId : undefined
        },
        include: { tenant: true }
      });
      console.log(`👤 Usuario registrado automáticamente en CRM: ${user.email} (${user.role})`);
    }

    // Verificar si el usuario o su negocio están desactivados (isActive === false)
    if (!user.isActive) {
      return res.status(403).json({ error: 'Usuario suspendido' });
    }

    if (user.tenant && !user.tenant.isActive) {
      return res.status(403).json({ error: 'Negocio suspendido o inactivo por falta de pago' });
    }

    let tenantId = user.tenantId;

    // Si el usuario no tiene tenantId asociado (ej. Superadmin global), asignarle por defecto el primer tenant activo
    if (!tenantId) {
      const firstTenant = await prisma.tenant.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' }
      });
      if (firstTenant) {
        tenantId = firstTenant.id;
        // Vincular en BD para consistencia futura
        await prisma.user.update({
          where: { id: user.id },
          data: { tenantId: firstTenant.id }
        }).catch(() => {});
      }
    }

    // Inyectar el usuario y tenantId en el request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: tenantId
    };

    next();
  } catch (error) {
    console.error("Error en authMiddleware:", error.response?.data || error.message);
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { authMiddleware };
