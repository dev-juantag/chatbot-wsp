import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";

type Service = {
  id: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  is_active: boolean;
};

export default function ServicesList() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newService, setNewService] = useState({ name: "", description: "", price: "", duration: "" });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    const { data } = await supabase.from("agent_services").select("*").order("created_at", { ascending: false });
    if (data) setServices(data);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newService.name) return;
    const { data: { session } } = await supabase.auth.getSession();
    let tenantId = session?.user?.user_metadata?.tenant_id;
    if (!tenantId && session?.user) {
      const { data: userRec } = await supabase.from('users').select('tenant_id').eq('id', session.user.id).maybeSingle();
      tenantId = userRec?.tenant_id;
    }

    const payload = { ...newService, tenant_id: tenantId || null };
    const { data, error } = await supabase.from("agent_services").insert([payload]).select().single();
    if (error) {
      alert("Error al guardar: " + error.message);
      console.error(error);
    }
    if (data) {
      setServices([data, ...services]);
      setNewService({ name: "", description: "", price: "", duration: "" });
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("agent_services").delete().eq("id", id);
    setServices(services.filter(s => s.id !== id));
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("agent_services").update({ is_active: !current }).eq("id", id);
    setServices(services.map(s => s.id === id ? { ...s, is_active: !current } : s));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-1">Servicios y Productos</h3>
          <p className="text-sm text-gray-500">Lo que el bot puede ofrecer y cotizar.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Agregar
        </button>
      </div>

      {isAdding && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 p-4 rounded-xl mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input 
              placeholder="Nombre del servicio" 
              className="px-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              value={newService.name} onChange={e => setNewService({...newService, name: e.target.value})}
            />
            <input 
              placeholder="Precio (Ej. $100.000 o Desde $50k)" 
              className="px-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              value={newService.price} onChange={e => setNewService({...newService, price: e.target.value})}
            />
            <input 
              placeholder="Duración (Ej. 60 min)" 
              className="px-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              value={newService.duration} onChange={e => setNewService({...newService, duration: e.target.value})}
            />
            <input 
              placeholder="Descripción breve..." 
              className="px-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              value={newService.description} onChange={e => setNewService({...newService, description: e.target.value})}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            <button onClick={handleAdd} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando servicios...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Servicio</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Duración</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3 rounded-tr-lg">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {services.map(service => (
                <tr key={service.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{service.name}</td>
                  <td className="px-4 py-3">{service.price || '-'}</td>
                  <td className="px-4 py-3">{service.duration || '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(service.id, service.is_active)} className={`p-1 rounded-full ${service.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      {service.is_active ? <Check size={14}/> : <X size={14}/>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(service.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No hay servicios configurados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
