"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import { 
  MessageSquare, Calendar, Settings, LogOut, Users, 
  Smartphone, Phone, ShieldAlert, Bot 
} from "lucide-react";
import Link from "next/link";

// Icono personalizado de WhatsApp con acabado Premium
const WhatsAppIcon = (props: any) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...props}>
    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.37 5.054L2 22l5.077-1.331a9.92 9.92 0 004.93 1.315h.005c5.505 0 9.988-4.478 9.99-9.985A9.99 9.99 0 0012.012 2zm5.78 13.567c-.244.689-1.2 1.256-1.656 1.3-1.256.122-2.822-.389-4.389-1.044-2.511-1.056-4.1-3.622-4.222-3.8-.133-.167-.989-1.311-.989-2.5 0-1.189.622-1.778.844-2.022.222-.244.489-.311.656-.311h.467c.122 0 .278-.011.411.311.144.356.5 1.222.544 1.311.044.089.078.2.022.311a.74.74 0 01-.156.244c-.1.122-.211.267-.311.378-.111.122-.233.256-.1.489.133.233.6 1.011 1.289 1.622.889.789 1.633 1.033 1.867 1.144.233.111.367.089.5-.067.133-.156.578-.678.733-.9.156-.222.311-.189.522-.111.211.078 1.333.622 1.567.733.233.111.389.167.444.267.067.1.067.578-.178 1.267z"/>
  </svg>
);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("agent");
  const [businessName, setBusinessName] = useState("Negocio");
  const [showAppointments, setShowAppointments] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUserAndConfig = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Leer el rol desde la tabla users (más confiable que user_metadata)
      const { data: userRecord } = await supabase
        .from("users")
        .select("role, tenant_id")
        .eq("id", session.user.id)
        .maybeSingle();

      const userRole = userRecord?.role || session.user?.user_metadata?.role || "agent";
      setRole(userRole);

      // Buscar config del tenant correcto — evitar .single() que falla si hay 0 o varios registros
      if (userRecord?.tenant_id) {
        const { data: config } = await supabase
          .from("agent_configs")
          .select("objectives, business_name")
          .eq("tenant_id", userRecord.tenant_id)
          .maybeSingle();

        if (config) {
          if (config.objectives) {
            setShowAppointments(config.objectives.includes("Agendar citas"));
          }
          if (config.business_name) {
            setBusinessName(config.business_name);
          }
        }
      }

      setLoading(false);
    };
    checkUserAndConfig();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;

  const navigation = [
    { name: "Chats", href: "/dashboard", icon: MessageSquare, show: true },
    { name: "Citas", href: "/dashboard/appointments", icon: Calendar, show: showAppointments },
    { name: "Contactos", href: "/dashboard/contacts", icon: Users, show: role !== 'agent' && role !== 'asesor' },
    { name: "Gestionar Asesores", href: "/dashboard/users", icon: Users, show: role === 'admin' || role === 'superadmin' },
    { name: "Conexión WhatsApp", href: "/dashboard/whatsapp", icon: WhatsAppIcon, show: role !== 'agent' && role !== 'asesor' },
  ].filter(nav => nav.show);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar Minimalista & Profesional */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-150 dark:border-gray-700 flex flex-col justify-between">
        
        <div>
          {/* Header con el nombre dinámico de la Empresa */}
          <div className="p-5 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10">
            <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/15">
              <Bot size={20} className="animate-pulse" />
            </div>
            <div className="flex flex-col truncate">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider leading-none mb-1">Chatbot</span>
              <h2 className="text-sm font-extrabold text-gray-800 dark:text-white truncate max-w-[150px] leading-tight">
                {businessName}
              </h2>
            </div>
          </div>
          
          {/* Menú de Navegación */}
          <nav className="px-3 space-y-1 mt-5">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50/80 dark:hover:bg-gray-700/50"
                  }`}
                >
                  <item.icon className={isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400"} size={18} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sección Inferior del Sidebar */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
          
          {/* Simulador Chatbot (Abajo, justo encima de Administración y Configuración) */}
          <Link
            href="/dashboard/lab"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              pathname === "/dashboard/lab"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                : "text-gray-650 dark:text-gray-400 hover:bg-gray-50/80 dark:hover:bg-gray-700/50"
            }`}
          >
            <Smartphone className={pathname === "/dashboard/lab" ? "text-blue-600" : "text-gray-450"} size={18} />
            <span>Simulador Chatbot</span>
          </Link>

          {/* Administración (Superadmin) */}
          {role === 'superadmin' && (
            <Link
              href="/dashboard/superadmin"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname === "/dashboard/superadmin"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                  : "text-gray-650 dark:text-gray-400 hover:bg-gray-50/80 dark:hover:bg-gray-700/50"
              }`}
            >
              <ShieldAlert className={pathname === "/dashboard/superadmin" ? "text-blue-600" : "text-gray-450"} size={18} />
              <span>Administración</span>
            </Link>
          )}

          {/* Configuración (Superadmin & Admin) */}
          {(role === 'admin' || role === 'superadmin') && (
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname === "/dashboard/settings"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                  : "text-gray-650 dark:text-gray-400 hover:bg-gray-50/80 dark:hover:bg-gray-700/50"
              }`}
            >
              <Settings className={pathname === "/dashboard/settings" ? "text-blue-600" : "text-gray-450"} size={18} />
              <span>Configuración</span>
            </Link>
          )}

          {/* Pie de página minimalista */}
          <div className="text-center text-[9px] text-gray-400 dark:text-gray-500 pt-1 leading-normal">
            © 2026 Juan Taguado | Reservados todos los derechos
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>

          {/* Cerrar Sesión */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all text-sm font-medium"
          >
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>

      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
