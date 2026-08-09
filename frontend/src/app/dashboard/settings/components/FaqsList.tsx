import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Check, X } from "lucide-react";

type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_active: boolean;
};

export default function FaqsList() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "", category: "" });

  useEffect(() => {
    fetchFaqs();
  }, []);

  const fetchFaqs = async () => {
    const { data } = await supabase.from("agent_faqs").select("*").order("created_at", { ascending: false });
    if (data) setFaqs(data);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newFaq.question || !newFaq.answer) return;
    const { data: { session } } = await supabase.auth.getSession();
    let tenantId = session?.user?.user_metadata?.tenant_id;
    if (!tenantId && session?.user) {
      const { data: userRec } = await supabase.from('users').select('tenant_id').eq('id', session.user.id).maybeSingle();
      tenantId = userRec?.tenant_id;
    }

    const payload = { ...newFaq, tenant_id: tenantId || null };
    const { data, error } = await supabase.from("agent_faqs").insert([payload]).select().single();
    if (error) {
      alert("Error al guardar: " + error.message);
      console.error(error);
    }
    if (data) {
      setFaqs([data, ...faqs]);
      setNewFaq({ question: "", answer: "", category: "" });
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("agent_faqs").delete().eq("id", id);
    setFaqs(faqs.filter(f => f.id !== id));
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("agent_faqs").update({ is_active: !current }).eq("id", id);
    setFaqs(faqs.map(f => f.id === id ? { ...f, is_active: !current } : f));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-1">Preguntas Frecuentes (FAQs)</h3>
          <p className="text-sm text-gray-500">Respuestas a preguntas comunes de los clientes.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Agregar FAQ
        </button>
      </div>

      {isAdding && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 p-4 rounded-xl mb-4 space-y-3">
          <input 
            placeholder="Pregunta (Ej. ¿Tienen parqueadero?)" 
            className="w-full px-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            value={newFaq.question} onChange={e => setNewFaq({...newFaq, question: e.target.value})}
          />
          <textarea 
            placeholder="Respuesta detallada..." 
            className="w-full px-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white resize-none"
            rows={2}
            value={newFaq.answer} onChange={e => setNewFaq({...newFaq, answer: e.target.value})}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            <button onClick={handleAdd} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando FAQs...</p>
      ) : (
        <div className="space-y-3">
          {faqs.map(faq => (
            <div key={faq.id} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium text-gray-900 dark:text-white">{faq.question}</h4>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(faq.id, faq.is_active)} className={`p-1 rounded-full ${faq.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {faq.is_active ? <Check size={14}/> : <X size={14}/>}
                  </button>
                  <button onClick={() => handleDelete(faq.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16}/></button>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{faq.answer}</p>
            </div>
          ))}
          {faqs.length === 0 && (
            <div className="text-center py-8 text-gray-500">No hay preguntas frecuentes configuradas.</div>
          )}
        </div>
      )}
    </div>
  );
}
