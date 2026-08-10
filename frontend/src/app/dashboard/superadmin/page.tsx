"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Building2, Power, UserPlus, Users, Trash2, 
  ShieldAlert, Plus, Activity, RefreshCw, ToggleLeft, ToggleRight, Loader2, Search, Pencil, KeyRound, Eye, EyeOff
} from "lucide-react";

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

type User = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
};

type WhatsappSession = {
  id: string;
  status: string;
  updatedAt: string;
};

type Tenant = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  users: User[];
  whatsappSession?: WhatsappSession | null;
};

export default function SuperadminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals / Form States
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [modalTenantSearch, setModalTenantSearch] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState("admin");
  
  const [actionLoading, setActionLoading] = useState(false);

  // Edit User Modal state
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserRole, setEditUserRole] = useState("agent");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);
  const [editUserTenantId, setEditUserTenantId] = useState("");

  const fetchTenants = async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let loadedFromDb = false;

      // 1. Intentar cargar primero desde Supabase directamente para respuesta instantánea
      const { data: tenantsDb, error: dbErr } = await supabase
        .from('tenants')
        .select('id, name, is_active, created_at, users(id, email, role, is_active), whatsapp_sessions(id, status, updated_at)')
        .order('created_at', { ascending: false });

      if (tenantsDb && !dbErr) {
        loadedFromDb = true;
        const formatted = tenantsDb.map((t: any) => ({
          id: t.id,
          name: t.name,
          isActive: t.is_active,
          createdAt: t.created_at,
          users: (t.users || []).map((u: any) => ({
            id: u.id,
            email: u.email,
            role: u.role,
            isActive: u.is_active
          })),
          whatsappSession: t.whatsapp_sessions?.[0] ? {
            id: t.whatsapp_sessions[0].id,
            status: t.whatsapp_sessions[0].status,
            updatedAt: t.whatsapp_sessions[0].updated_at
          } : null
        }));
        setTenants(formatted);
      }

      // 2. Intentar consultar backend a través de la ruta API de Next.js
      try {
        const res = await fetch("/api/superadmin/tenants", {
          headers: {
            "Authorization": `Bearer ${session.access_token}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          setTenants(data);
          loadedFromDb = true;
        }
      } catch (e) {
        // Ignorar error de red si ya cargaron desde Supabase
      }

      if (!loadedFromDb) {
        setError("Error cargando la lista de negocios.");
      }
    } catch (err: any) {
      setError(err.message || "Error al cargar la información del Superadmin.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim() || actionLoading) return;

    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const tenantName = newTenantName.trim();
      let created = false;

      // 1. Intentar vía Supabase directamente para máxima confiabilidad
      const { data: newTenant, error: tenantErr } = await supabase
        .from('tenants')
        .insert({ name: tenantName, is_active: true })
        .select()
        .single();

      if (newTenant && !tenantErr) {
        created = true;
        await supabase.from('agent_configs').insert({
          tenant_id: newTenant.id,
          bot_name: 'Tagu',
          business_name: tenantName,
          is_active: true,
          objectives: ['Agendar citas']
        });
        await supabase.from('whatsapp_sessions').insert({
          tenant_id: newTenant.id,
          status: 'DISCONNECTED'
        });
      }

      // 2. Intentar respaldar mediante ruta relativa API de Next.js
      if (!created) {
        const res = await fetch("/api/superadmin/tenants", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ name: tenantName })
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || "No se pudo crear el negocio.");
        }
      }

      setNewTenantName("");
      setShowCreateTenant(false);
      fetchTenants();
    } catch (err: any) {
      alert(err.message || "Error al crear el negocio.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleTenant = async (id: string, currentStatus: boolean) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const newStatus = !currentStatus;
      await supabase.from('tenants').update({ is_active: newStatus }).eq('id', id);

      try {
        await fetch(`/api/backend/superadmin/tenants/${id}/toggle`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ isActive: newStatus })
        });
      } catch (_) {}

      fetchTenants();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTenant = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente a "${name}"?\nEsta acción es irreversible y borrará todos sus datos.`)) return;

    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.from('tenants').delete().eq('id', id);

      try {
        await fetch(`/api/backend/superadmin/tenants/${id}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${session.access_token}`
          }
        });
      } catch (_) {}

      fetchTenants();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserPassword.trim() || !selectedTenantId || actionLoading) return;

    setActionLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesión no válida. Por favor recarga la página.");

      const cleanEmail = newUserEmail.trim().toLowerCase();
      const targetTenant = tenants.find(t => t.id === selectedTenantId);
      const isTechTag = targetTenant && targetTenant.name.toLowerCase().includes("techtag");
      const finalRole = (!isTechTag && newUserRole === "superadmin") ? "admin" : newUserRole;

      // Crear a través de la ruta relativa API de Next.js (Resuelve 100% el Failed to fetch y omite rate-limits)
      const res = await fetch("/api/superadmin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: newUserPassword.trim(),
          role: finalRole,
          tenantId: selectedTenantId
        })
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok || !resData.success) {
        throw new Error(resData.error || "No se pudo crear el usuario.");
      }

      setNewUserEmail("");
      setNewUserPassword("");
      setShowCreateUser(false);
      fetchTenants();
      alert(`✅ Usuario ${cleanEmail} creado y vinculado exitosamente a ${targetTenant?.name || 'el negocio'}.`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleUser = async (userId: string, currentStatus: boolean) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const newStatus = !currentStatus;
      await supabase.from('users').update({ is_active: newStatus }).eq('id', userId);
      fetchTenants();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`¿Eliminar permanentemente al usuario "${userEmail}"?\nEsta acción no se puede deshacer.`)) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/superadmin/users/${userId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar el usuario.");

      fetchTenants();
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const openEditUser = (user: User, tenantId: string) => {
    setEditingUser(user);
    setEditUserRole(user.role);
    setEditUserPassword("");
    setEditUserTenantId(tenantId);
    setShowEditUser(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || actionLoading) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/superadmin/users/${editingUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          role: editUserRole,
          password: editUserPassword.trim() || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar el usuario.");

      setShowEditUser(false);
      setEditingUser(null);
      fetchTenants();
      alert(`✅ Usuario ${editingUser.email} actualizado correctamente.`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Cálculo elegante del tiempo offline
  const formatOfflineTime = (updatedAtStr?: string) => {
    if (!updatedAtStr) return "Desconocido";
    const lastActive = new Date(updatedAtStr);
    const diffMs = Date.now() - lastActive.getTime();
    if (diffMs <= 0) return "1m";

    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m`;

    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">Cargando panel global de Superadmin...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <ShieldAlert className="text-red-500" size={32} />
            Panel de Control Global (Superadmin)
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gestión centralizada de licencias, negocios (tenants), accesos y monitorización en tiempo real.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchTenants}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors font-medium text-sm"
          >
            <RefreshCw size={16} />
            Refrescar
          </button>
          <button 
            onClick={() => setShowCreateTenant(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-md"
          >
            <Plus size={16} />
            Crear Negocio
          </button>
          <button 
            onClick={() => {
              if (tenants.length === 0) {
                alert("Debes crear al menos un negocio antes de asociar usuarios.");
                return;
              }
              setSelectedTenantId(tenants[0].id);
              setShowCreateUser(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-semibold text-sm shadow-md"
          >
            <UserPlus size={16} />
            Vincular Usuario
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-3">
          <ShieldAlert className="flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Buscador de Negocios */}
      <div className="mb-6 relative">
        <Search className="absolute left-3.5 top-3 text-gray-400" size={18} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar negocio por nombre o ID (ej. TechTag, Barbería...)..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all"
        />
      </div>

      {/* Lista de Negocios */}
      {(() => {
        const filteredTenants = tenants.filter(t => 
          t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.id.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (filteredTenants.length === 0) {
          return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">No se encontraron negocios</h3>
              <p className="text-xs text-gray-500 mt-1">No hay ningún negocio registrado que coincida con "{searchTerm}".</p>
            </div>
          );
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredTenants.map((tenant) => {
              const lastUpdated = tenant.whatsappSession?.updatedAt;
              const isOnline = tenant.whatsappSession?.status === "CONNECTED" || tenant.whatsappSession?.status === "ready";

              return (
                <div 
                  key={tenant.id}
                  className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border p-6 flex flex-col justify-between transition-all hover:shadow-md ${
                    tenant.isActive ? "border-gray-200 dark:border-gray-700" : "border-red-300 dark:border-red-950 bg-red-50/5 dark:bg-red-950/5"
                  }`}
                >
                  <div>
                    {/* Cabecera del Negocio */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${tenant.isActive ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600" : "bg-red-100 text-red-600"}`}>
                          <Building2 size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            {tenant.name}
                            {!tenant.isActive && (
                              <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-2 py-0.5 rounded-full font-bold uppercase">
                                Suspendido
                              </span>
                            )}
                          </h3>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{tenant.id}</p>
                        </div>
                      </div>

                      {/* Estado de Conexión en Tiempo Real */}
                      <div className="flex flex-col items-end">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          isOnline 
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
                          {isOnline ? "🟢 Online" : `🔴 Offline (${formatOfflineTime(lastUpdated)})`}
                        </span>
                        <span className="text-[9px] text-gray-400 mt-1">Último Heartbeat: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Nunca"}</span>
                      </div>
                    </div>

                    {/* Lista de Usuarios Asociados */}
                    <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                        <Users size={16} />
                        Usuarios Asociados ({tenant.users.length})
                      </h4>
                      {tenant.users.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No hay usuarios vinculados a este negocio.</p>
                      ) : (
                        <div className="space-y-2">
                          {tenant.users.map((u) => (
                            <div 
                              key={u.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-xs border border-gray-100 dark:border-gray-800"
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-800 dark:text-gray-200">{u.email}</span>
                                <span className="text-[10px] text-gray-400 font-mono">UUID: {u.id}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${
                                  u.role === 'superadmin'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/50'
                                    : u.role === 'admin' 
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' 
                                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                                }`}>
                                  {u.role === 'superadmin' ? 'Superadmin' : u.role === 'admin' ? 'Admin' : 'Empleado'}
                                </span>
                                <button
                                  title="Activar/Desactivar"
                                  onClick={() => handleToggleUser(u.id, u.isActive)}
                                  className="text-gray-400 hover:text-blue-500 transition-colors"
                                >
                                  {u.isActive ? (
                                    <ToggleRight size={20} className="text-green-500" />
                                  ) : (
                                    <ToggleLeft size={20} className="text-gray-400" />
                                  )}
                                </button>
                                <button
                                  title="Editar usuario"
                                  onClick={() => openEditUser(u, tenant.id)}
                                  className="text-gray-400 hover:text-indigo-500 transition-colors p-0.5 rounded"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  title="Eliminar usuario"
                                  onClick={() => handleDeleteUser(u.id, u.email)}
                                  className="text-gray-400 hover:text-red-500 transition-colors p-0.5 rounded"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botones de Control */}
                  <div className="mt-6 flex gap-3 border-t border-gray-100 dark:border-gray-700 pt-4 justify-end">
                    <button
                      onClick={() => handleToggleTenant(tenant.id, tenant.isActive)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        tenant.isActive 
                          ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400" 
                          : "bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400"
                      }`}
                    >
                      <Power size={14} />
                      {tenant.isActive ? "Desactivar Licencia" : "Activar Licencia"}
                    </button>
                    <button
                      onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                      Eliminar Negocio
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* MODAL CREAR NEGOCIO */}
      {showCreateTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Crear Nuevo Negocio</h3>
            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Nombre de la Empresa</label>
                <input 
                  type="text"
                  required
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="Ej. Barbería Techtag"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 text-sm focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowCreateTenant(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : "Crear Negocio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR Y VINCULAR USUARIO */}
      {showCreateUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Crear y Vincular Nuevo Usuario</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Buscar y Seleccionar Negocio</label>
                
                {/* Campo buscador dentro del modal */}
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 text-gray-400" size={15} />
                  <input
                    type="text"
                    value={modalTenantSearch}
                    onChange={(e) => {
                      const query = e.target.value;
                      setModalTenantSearch(query);
                      const matches = tenants.filter(t => t.name.toLowerCase().includes(query.toLowerCase()) || t.id.toLowerCase().includes(query.toLowerCase()));
                      if (matches.length > 0) {
                        setSelectedTenantId(matches[0].id);
                      }
                    }}
                    placeholder="Escribe el nombre del negocio (ej. Barbería)..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Desplegable con únicamente las opciones filtradas por la búsqueda */}
                {(() => {
                  const filteredModalTenants = tenants.filter(t => 
                    t.name.toLowerCase().includes(modalTenantSearch.toLowerCase()) ||
                    t.id.toLowerCase().includes(modalTenantSearch.toLowerCase())
                  );

                  return (
                    <select
                      value={selectedTenantId}
                      onChange={(e) => setSelectedTenantId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 text-sm text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {filteredModalTenants.length === 0 ? (
                        <option value="" disabled>No hay negocios coincidentes</option>
                      ) : (
                        filteredModalTenants.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))
                      )}
                    </select>
                  );
                })()}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Correo Electrónico</label>
                <input 
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="ejemplo@barberia.com"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Contraseña Inicial</label>
                <div className="relative">
                  <input 
                    type={showNewUserPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 pr-10 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showNewUserPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Rol del Usuario</label>
                {(() => {
                  const currentTenant = tenants.find(t => t.id === selectedTenantId);
                  const isTechTag = currentTenant && currentTenant.name.toLowerCase().includes("techtag");
                  return (
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 text-sm text-gray-900 dark:text-white"
                    >
                      {isTechTag && (
                        <option value="superadmin">Superadministrador (Acceso total global)</option>
                      )}
                      <option value="admin">Administrador (Dueño de local)</option>
                      <option value="agent">Empleado (Solo chat/citas)</option>
                    </select>
                  );
                })()}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowCreateUser(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : "Crear y Vincular"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR USUARIO */}
      {showEditUser && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Editar Usuario</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 font-mono">{editingUser.email}</p>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Rol del Usuario</label>
                {(() => {
                  const tenant = tenants.find(t => t.id === editUserTenantId);
                  const isTechTag = tenant && tenant.name.toLowerCase().includes("techtag");
                  return (
                    <select
                      value={editUserRole}
                      onChange={(e) => setEditUserRole(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {isTechTag && (
                        <option value="superadmin">Superadministrador (Acceso total global)</option>
                      )}
                      <option value="admin">Administrador (Dueño de local)</option>
                      <option value="agent">Empleado (Solo chat/citas)</option>
                    </select>
                  );
                })()}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  <span className="flex items-center gap-1.5"><KeyRound size={12} /> Nueva Contraseña (opcional)</span>
                </label>
                <div className="relative">
                  <input
                    type={showEditUserPassword ? "text" : "password"}
                    minLength={6}
                    value={editUserPassword}
                    onChange={(e) => setEditUserPassword(e.target.value)}
                    placeholder="Dejar vacío para no cambiar la contraseña"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-2.5 pr-10 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditUserPassword(!showEditUserPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showEditUserPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEditUser(false); setEditingUser(null); }}
                  className="px-4 py-2 border rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
