const { createClient } = require('@supabase/supabase-js');

// Configuración quemada solo para el seed local
const SUPABASE_URL = "https://ssmmjezafbtopkpwmazz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7f37Fo0mJkLV9U6H31cFzw_Orr5h-E7";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function seed() {
  console.log("Creando usuario administrador...");
  
  const { data, error } = await supabase.auth.signUp({
    email: 'juantaguado05@gmail.com',
    password: 'admin123',
  });

  if (error) {
    console.error("Error creando usuario:", error.message);
  } else {
    console.log("✅ Usuario creado exitosamente:", data.user?.email);
    console.log("⚠️ IMPORTANTE: Si Supabase tiene 'Confirm Email' activado (por defecto lo tiene), deberás confirmar el correo o desactivar esa opción en Authentication > Providers > Email.");
  }
}

seed();
