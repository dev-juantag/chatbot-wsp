"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, UserPlus, ToggleLeft, ToggleRight, Loader2, KeyRound } from "lucide-react";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ssmmjezafbtopkpwmazz.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_7f37Fo0mJkLV9U6H31cFzw_Orr5h-E7";

const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

type AgentUser = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export default function ManageUsersPage() {
  const [users, setUsers] = useState<AgentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Obtener tenant_id del usuario logueado
      const { data: me } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!me?.tenant_id) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("users")
        .select("id, email, role, is_active, created_at")
        .eq("tenant_id", me.tenant_id)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      // Mapear snake_case a camelCase
      setUsers((data || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
        createdAt: u.created_at
      })));
    } catch (error: any) {
      console.error("fetchUsers error:", error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || actionLoading) return;

    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Obtener tenant_id del usuario logueado
      const { data: me } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!me?.tenant_id) throw new Error("No se encontró el negocio del administrador.");

      // 1. Crear usuario en Supabase Auth usando cliente aislado
      const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: { data: { role: "agent" } }
      });

      if (signUpError) throw new Error(`Error creando cuenta: ${signUpError.message}`);
      const generatedAuthId = signUpData.user?.id;
      if (!generatedAuthId) throw new Error("No se pudo obtener el ID del usuario creado.");

      // 2. Registrar en la tabla users directamente via Supabase
      const { error: insertError } = await supabase
        .from("users")
        .insert([{ id: generatedAuthId, email: email.trim(), role: "agent", tenant_id: me.tenant_id, is_active: true }]);

      if (insertError) throw new Error(`Error registrando asesor: ${insertError.message}`);

      setEmail("");
      setPassword("");
      setShowAddUser(false);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleUser = async (id: string, currentStatus: boolean) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (updateError) throw new Error("No se pudo cambiar el estado del asesor.");
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">Cargando asesores y empleados...</p>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="text-blue-500" size={28} />
            Gestionar Asesores y Empleados
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Crea y administra los asesores o empleados de tu negocio que tendrán acceso al CRM (Chats y Citas).
          </p>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-md"
        >
          <UserPlus size={16} />
          Agregar Empleado
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Lista de Usuarios */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {users.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No tienes asesores o empleados creados aún. Haz clic en "Agregar Empleado" para registrar el primero.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Correo Electrónico</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID de Autenticación</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rol</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">{u.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-bold text-[10px] uppercase">
                        Asesor / Agente
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        u.isActive 
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {u.isActive ? "Activo" : "Desactivado"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleToggleUser(u.id, u.isActive)}
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                      >
                        {u.isActive ? (
                          <ToggleRight size={28} className="text-green-500" />
                        ) : (
                          <ToggleLeft size={28} className="text-gray-400" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL AGREGAR EMPLEADO */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Agregar Nuevo Empleado</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Correo Electrónico</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="empleado@mi-negocio.com"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                  <KeyRound size={14} />
                  Contraseña Inicial del Empleado
                </label>
                <input 
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowAddUser(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : "Crear Empleado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
