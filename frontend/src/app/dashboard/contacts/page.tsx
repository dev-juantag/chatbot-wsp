"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Search, Phone, ChevronRight } from "lucide-react";
import { parsePhoneNumberFromString } from 'libphonenumber-js';

type Contact = {
  id: string;
  phone: string;
  name: string;
  pipeline_stage: string;
  created_at: string;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");

  const formatPhone = (phone: string) => {
    if (!phone) return "";
    let clean = phone.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '');
    if (!clean.startsWith('+')) clean = '+' + clean;
    try {
      const phoneNumber = parsePhoneNumberFromString(clean);
      if (phoneNumber) return phoneNumber.formatInternational();
    } catch (e) {
      // ignore
    }
    return clean;
  };

  const getInitials = (name: string) => {
    if (!name || name === "Cliente") return "CL";
    const parts = name.split(" ");
    return parts.map(p => p[0]).slice(0, 2).join("").toUpperCase();
  };

  const getAvatarBg = (name: string) => {
    if (!name || name === "Cliente") return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    const colors = [
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
      "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
    ];
    const code = name.charCodeAt(0) % colors.length;
    return colors[code];
  };

  const fetchContacts = async () => {
    const { data } = await supabase.from('contacts').select('*').order('created_at', { ascending: false });
    if (data) setContacts(data);
  };

  useEffect(() => {
    fetchContacts();

    const channel = supabase.channel('contacts_changes_page')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, payload => {
        setContacts(prev => [payload.new as Contact, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, payload => {
        setContacts(prev => prev.map(c => c.id === payload.new.id ? payload.new as Contact : c));
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel) };
  }, []);

  const filteredContacts = contacts.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.phone.includes(search)
  );

  return (
    <div className="p-8 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Cabecera y Buscador */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2.5">
              <Users size={28} className="text-blue-500" />
              Directorio de Contactos
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Todos los clientes que han interactuado con tu negocio y el bot.</p>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por nombre o número..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white shadow-sm transition-all"
            />
          </div>
        </div>

        {/* Tabla / Lista de Contactos */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-150 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-150 dark:border-gray-700">
                  <th className="px-6 py-4 font-bold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wider">Nombre del Cliente</th>
                  <th className="px-6 py-4 font-bold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wider">Teléfono / WhatsApp</th>
                  <th className="px-6 py-4 font-bold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wider">Etapa (Pipeline)</th>
                  <th className="px-6 py-4 font-bold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wider text-right">Fecha de Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {filteredContacts.map(contact => (
                  <tr key={contact.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-sm shrink-0 ${getAvatarBg(contact.name)}`}>
                          {getInitials(contact.name)}
                        </div>
                        <span className="font-semibold text-sm text-gray-800 dark:text-white">
                          {contact.name || 'Sin Nombre'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-medium">
                        <Phone size={14} className="text-gray-400" />
                        <span>{formatPhone(contact.phone)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/50 dark:text-blue-300 capitalize">
                        {contact.pipeline_stage.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 dark:text-gray-400 text-xs font-semibold">
                      {new Date(contact.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
                {filteredContacts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                      No se encontraron contactos en tu directorio.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
