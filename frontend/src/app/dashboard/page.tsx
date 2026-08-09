"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Send, User, MessageSquare, Bot, BotOff, Paperclip, Clock } from "lucide-react";
import Link from "next/link";
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { decryptMessagesAction } from "../actions";

type Contact = {
  id: string;
  phone: string;
  name: string;
  pipeline_stage: string;
  bot_paused_until?: string;
};

type Message = {
  id: string;
  direction: string;
  content: string;
  created_at: string;
  sender_type: string;
};

export default function InboxPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isBotPaused, setIsBotPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [wsConnected, setWsConnected] = useState<boolean | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reloj en tiempo real del sistema
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Estado de conexión WhatsApp en tiempo real
  useEffect(() => {
    const checkWsStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. Consultar primeramente en Supabase para respuesta instantánea y 100% estable
        const { data: userRecord } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', session.user.id)
          .maybeSingle();

        const tenantId = userRecord?.tenant_id || session.user.user_metadata?.tenant_id;
        let isDbConnected = false;

        if (tenantId) {
          const { data: wsDb } = await supabase
            .from('whatsapp_sessions')
            .select('status')
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (wsDb?.status === 'CONNECTED') {
            isDbConnected = true;
            setWsConnected(true);
          }
        }

        // 2. Consultar backend Express para verificación en tiempo real
        const res = await fetch('http://localhost:3001/api/whatsapp/status', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setWsConnected(data.status === 'ready' || data.status === 'CONNECTED');
        } else if (!isDbConnected) {
          setWsConnected(false);
        }
      } catch (e) {
        // Ignorar excepciones de red esporádicas si ya se validó por Supabase
      }
    };

    checkWsStatus();
    const interval = setInterval(checkWsStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  };

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token || ""}`
    };
  };

  const activeContactRef = useRef<Contact | null>(null);
  // Ref para rastrear IDs conocidos sin leer estado dentro de callbacks
  const knownMsgIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  useEffect(() => {
    // Mantener el ref sincronizado con los mensajes visibles
    knownMsgIdsRef.current = new Set(messages.map(m => m.id));
    scrollToBottom();
  }, [messages]);

  const loadContacts = async () => {
    const { data } = await supabase
      .from('contacts')
      .select('*, messages(content, created_at, direction, sender_type)')
      .order('created_at', { ascending: false, referencedTable: 'messages' });
      
    if (data) {
      // Extraer el mensaje más reciente para cada contacto
      const contactsWithLastMsg = data.map(c => {
        const sortedMsgs = (c.messages || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return {
          ...c,
          lastMessageObj: sortedMsgs.length > 0 ? sortedMsgs[0] : null
        };
      });

      // Decrypt last messages
      const textsToDecrypt = contactsWithLastMsg.map(c => c.lastMessageObj ? c.lastMessageObj.content : '');
      const decryptedTexts = await decryptMessagesAction(textsToDecrypt);
      
      contactsWithLastMsg.forEach((c, i) => {
        if (c.lastMessageObj) {
          c.lastMessageObj.content = decryptedTexts[i];
        }
      });

      // Ordenamos por la fecha del último mensaje
      contactsWithLastMsg.sort((a, b) => {
        const timeA = a.lastMessageObj ? new Date(a.lastMessageObj.created_at).getTime() : 0;
        const timeB = b.lastMessageObj ? new Date(b.lastMessageObj.created_at).getTime() : 0;
        return timeB - timeA;
      });

      setContacts(contactsWithLastMsg);
    }
  };

    // ── Realtime: canal único por sesión + polling de respaldo ──────────────────
  useEffect(() => {
    loadContacts();

    // Canal con nombre único para evitar conflictos entre recargas
    const channelName = `dashboard_${Date.now()}`;
    const mainChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const raw = payload.new as any;

          // Descifrar el contenido ANTES de actualizar cualquier estado
          let decryptedContent = raw.content;
          try {
            const [dec] = await decryptMessagesAction([raw.content]);
            decryptedContent = dec;
          } catch { /* usar raw si falla */ }

          const newMsg = { ...raw, content: decryptedContent };

          // 1. Insertar en chat activo si corresponde
          if (activeContactRef.current && newMsg.contact_id === activeContactRef.current.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg as Message];
            });
          }

          // 2. Actualizar barra lateral CON CONTENIDO YA DESCIFRADO
          setContacts((prev) => {
            const index = prev.findIndex((c) => c.id === newMsg.contact_id);
            if (index === -1) { loadContacts(); return prev; }
            const updated = {
              ...prev[index],
              lastMessageObj: {
                content: decryptedContent,   // ← ya descifrado
                created_at: newMsg.created_at,
                direction: newMsg.direction,
                sender_type: newMsg.sender_type,
              },
            };
            // Mover al tope de la lista (mensaje más reciente primero)
            const next = prev.filter((c) => c.id !== newMsg.contact_id);
            return [updated, ...next];
          });
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, () => {
        loadContacts();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, (payload) => {
        setContacts((prev) => prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c)));
        setActiveContact((prev) => (prev && prev.id === payload.new.id ? { ...prev, ...(payload.new as Contact) } : prev));
      })
      .subscribe((status) => {
        console.log('[Realtime] estado del canal:', status);
      });

    // ── Polling de respaldo cada 2s para mensajes del chat activo ──
    const chatPollInterval = setInterval(() => {
      if (activeContactRef.current) {
        fetchMessagesQuiet(activeContactRef.current.id);
      }
    }, 2000);

    // ── Polling de respaldo cada 4s para la lista de conversaciones ──
    const sidebarPollInterval = setInterval(() => {
      loadContacts();
    }, 4000);

    return () => {
      supabase.removeChannel(mainChannel);
      clearInterval(chatPollInterval);
      clearInterval(sidebarPollInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (activeContact) {
      fetchMessages(activeContact.id);
      const isPausedByStage = activeContact.pipeline_stage === 'handoff';
      const isPausedByTimer = activeContact.bot_paused_until && new Date(activeContact.bot_paused_until) > new Date();
      setIsBotPaused(!!(isPausedByStage || isPausedByTimer));
    }
  }, [activeContact?.id]);



  const fetchContacts = async () => {
    await loadContacts();
  };

  const fetchMessages = async (contactId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });
    if (data) {
      const decryptedContents = await decryptMessagesAction(data.map(m => m.content));
      const decryptedData = data.map((m, i) => ({ ...m, content: decryptedContents[i] }));
      setMessages(decryptedData);
    }
  };

  // Poll silencioso: agrega solo mensajes nuevos SIN setState anidados
  const fetchMessagesQuiet = async (contactId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });

    if (!data || data.length === 0) return;

    // Usar el ref (no setState callback) para comparar IDs conocidos
    const newOnes = data.filter(m => !knownMsgIdsRef.current.has(m.id));
    if (newOnes.length === 0) return;

    // Descifrar COMPLETAMENTE fuera de cualquier setState
    const decrypted = await decryptMessagesAction(newOnes.map(m => m.content));
    const decryptedNew = newOnes.map((m, i) => ({ ...m, content: decrypted[i] }));

    // 1. Actualizar mensajes (una sola llamada limpia, sin anidar)
    setMessages(current => {
      const ids = new Set(current.map(x => x.id));
      const toAdd = decryptedNew.filter(m => !ids.has(m.id));
      if (toAdd.length === 0) return current;
      return [...current, ...toAdd].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    // 2. Actualizar barra lateral (llamada SEPARADA, nunca anidada)
    const last = decryptedNew[decryptedNew.length - 1];
    setContacts(prev => {
      const idx = prev.findIndex(c => c.id === contactId);
      if (idx === -1) return prev;
      const updated = {
        ...prev[idx],
        lastMessageObj: {
          content: last.content,
          created_at: last.created_at,
          direction: last.direction,
          sender_type: last.sender_type,
        },
      };
      return [updated, ...prev.filter(c => c.id !== contactId)];
    });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !activeContact) return;

    const currentMsg = newMessage;
    setNewMessage("");

    // Optimistic UI: mostrar el mensaje inmediatamente sin esperar al servidor
    const optimisticMsg: Message = {
      id: `optimistic_${Date.now()}`,
      direction: 'outbound',
      content: currentMsg,
      created_at: new Date().toISOString(),
      sender_type: 'human',
    };
    setMessages(prev => [...prev, optimisticMsg]);



    // Actualizar la barra lateral optimísticamente también
    setContacts((prev) => {
      const index = prev.findIndex((c) => c.id === activeContact.id);
      if (index === -1) return prev;
      const updated = {
        ...prev[index],
        lastMessageObj: {
          content: currentMsg,
          created_at: optimisticMsg.created_at,
          direction: 'outbound',
          sender_type: 'human',
        },
      };
      return [updated, ...prev.filter((c) => c.id !== activeContact.id)];
    });

    try {
      const res = await fetch("http://localhost:3001/api/messages/send", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          contactId: activeContact.id,
          content: currentMsg
        })
      });
      // Reemplazar el mensaje optimístico con el real una vez que el servidor confirma
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        if (saved?.message?.id) {
          setMessages(prev =>
            prev.map(m => m.id === optimisticMsg.id ? { ...m, id: saved.message.id } : m)
          );
        }
      }
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
    }
  };


  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleToggleBot = async () => {
    if (!activeContact) return;
    const newState = !isBotPaused;
    setIsBotPaused(newState);
    
    try {
      await fetch(`http://localhost:3001/api/contacts/${activeContact.id}/toggle-bot`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ paused: newState })
      });
      fetchContacts();
    } catch (error) {
      console.error("Error al pausar/encender bot:", error);
      setIsBotPaused(!newState);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeContact) return;
    
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const res = await fetch("http://localhost:3001/api/messages/send-file", {
            method: "POST",
            headers: await getAuthHeaders(),
            body: JSON.stringify({
              contactId: activeContact.id,
              fileBase64: base64,
              fileName: file.name,
              mimeType: file.type,
              caption: newMessage.trim() !== '' ? newMessage : undefined
            })
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.error("Error de HTTP al subir archivo:", res.status, errData);
            alert(`Error al enviar archivo: El servidor respondió con código ${res.status}`);
          }
        } catch (fetchErr: any) {
          console.error("Error de red al subir archivo:", fetchErr);
          alert(`Error de red al enviar archivo: ${fetchErr.message || fetchErr}`);
        } finally {
          if (newMessage.trim() !== '') setNewMessage("");
          setIsUploading(false);
        }
      };
    } catch (error) {
      console.error("Error inicial subiendo archivo:", error);
      setIsUploading(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };


  // Detecta si un número parece un LID de WhatsApp (>13 dígitos, no es un teléfono real)
  const isLidNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length > 13;
  };

  const formatPhone = (phone: string) => {
    if (!phone) return "";
    let clean = phone
      .replace('@c.us', '')
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '')
      .replace(/\s/g, '')
      .trim();

    // Si parece un LID de WhatsApp (>13 dígitos), mostrar versión corta legible
    if (isLidNumber(clean)) {
      const digits = clean.replace(/\D/g, '');
      // Tomar los últimos 10 dígitos como referencia — puede coincidir con número real
      return `Tel. ...${digits.slice(-10)}`;
    }

    // Corrección de prefijos LID mal mapeados (ej: 52819... → 573...)
    const digits = clean.replace(/\D/g, '');
    if (digits.startsWith('52819') && digits.length > 11) {
      clean = '57' + digits.slice(5);
    } else {
      clean = digits;
    }

    if (!clean.startsWith('+')) clean = '+' + clean;

    try {
      const phoneNumber = parsePhoneNumberFromString(clean, 'CO');
      if (phoneNumber && phoneNumber.isValid()) {
        return phoneNumber.formatInternational();
      }
    } catch (e) {}

    if (clean.startsWith('+57') && clean.length === 13) {
      return `+57 ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`;
    }

    return clean;
  };

  const getInitials = (name: string) => {
    if (!name || name === "Cliente") return "CL";
    const parts = name.split(" ");
    return parts.map(p => p[0]).slice(0, 2).join("").toUpperCase();
  };

  const getAvatarBg = (name: string) => {
    if (!name || name === "Cliente") return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
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

  return (
    <div className="flex h-full bg-white dark:bg-[#0b141a] overflow-hidden">
      {/* Sidebar de Chats */}
      <div className="w-80 border-r border-gray-200 dark:border-[#222d34] flex flex-col bg-gray-50/50 dark:bg-[#111b21]">
        <div className="p-3.5 border-b border-gray-200 dark:border-[#222d34] bg-[#f0f2f5] dark:bg-[#202c33]">
          {/* Header con título Chats + Reloj + Estado WhatsApp */}
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-[#e9edef]">Chats</h2>
            
            <div className="flex items-center gap-2">
              {/* Reloj del sistema */}
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-gray-600 dark:text-[#8696a0] bg-white dark:bg-[#111b21] px-2 py-0.5 rounded border border-gray-200 dark:border-[#2a3942] shadow-xs" title="Hora actual del sistema">
                <Clock size={11} className="text-gray-400" />
                <span>{currentTime}</span>
              </div>

              {/* Estado Conexión WhatsApp */}
              <Link 
                href="/dashboard/whatsapp" 
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition-all ${
                  wsConnected === true
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                    : wsConnected === false
                    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-900/40'
                    : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                }`}
                title={wsConnected === true ? "WhatsApp Conectado - Click para ver detalles" : "WhatsApp Desconectado - Click para conectar"}
              >
                <span className={`w-2 h-2 rounded-full ${
                  wsConnected === true 
                    ? 'bg-emerald-500 animate-pulse' 
                    : wsConnected === false 
                    ? 'bg-red-500' 
                    : 'bg-amber-400 animate-ping'
                }`} />
                <span className="truncate max-w-[80px]">
                  {wsConnected === true ? 'Conectado' : wsConnected === false ? 'Desconectado' : '...'}
                </span>
              </Link>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar chat..." 
              value={searchQuery || ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#2a3942] border border-gray-200 dark:border-none rounded-lg text-sm text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:ring-1 focus:ring-[#00a884]"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {contacts.filter((contact: any) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            const nameMatch = contact.name?.toLowerCase().includes(q);
            const phoneMatch = contact.phone?.toLowerCase().includes(q);
            const formattedPhoneMatch = formatPhone(contact.phone)?.toLowerCase().includes(q);
            const lastMsg = contact.lastMessageObj;
            const msgMatch = lastMsg?.content?.toLowerCase().includes(q);
            return nameMatch || phoneMatch || formattedPhoneMatch || msgMatch;
          }).map((contact: any) => {
            const lastMsg = contact.lastMessageObj;
            const timeStr = lastMsg ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const requiresHuman = contact.pipeline_stage === 'handoff' || (contact.bot_paused_until && new Date(contact.bot_paused_until) > new Date());
            const isUnreadOrPending = lastMsg && lastMsg.direction === 'inbound' && requiresHuman;

            return (
              <div 
                key={contact.id} 
                onClick={() => setActiveContact(contact)}
                className={`p-3.5 border-b border-gray-100 dark:border-[#222d34] cursor-pointer transition-colors relative ${
                  activeContact?.id === contact.id ? 'bg-[#f0f2f5] dark:bg-[#2a3942]' : 'hover:bg-gray-100 dark:hover:bg-[#202c33]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${getAvatarBg(contact.name)}`}>
                      {getInitials(contact.name)}
                    </div>
                    {isUnreadOrPending && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 border-2 border-white dark:border-[#111b21] rounded-full"></span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-medium text-gray-900 dark:text-[#e9edef] truncate text-sm">
                        {contact.name && contact.name !== contact.phone && contact.name !== 'Cliente' 
                          ? contact.name 
                          : formatPhone(contact.phone)}
                      </h3>
                      {timeStr && <span className="text-[11px] text-gray-500 dark:text-[#8696a0] shrink-0 ml-2">{timeStr}</span>}
                    </div>
                    
                    <div className="flex justify-between items-center gap-1 mb-1">
                      <p className="text-xs text-gray-500 dark:text-[#8696a0] truncate flex-1">
                        {lastMsg ? lastMsg.content : 'Sin mensajes aún'}
                      </p>
                    </div>

                    {requiresHuman && (
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 dark:bg-[#382b18] text-amber-800 dark:text-[#ffc978]">
                          <BotOff size={10} />
                          Requiere intervención humana
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pane Principal del Chat Estilo WhatsApp */}
      {activeContact ? (
        <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a]">
          {/* Header del Chat */}
          <div className="p-3 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-gray-200 dark:border-[#222d34] flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-sm shrink-0 ${getAvatarBg(activeContact.name)}`}>
                {getInitials(activeContact.name)}
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-[#e9edef] text-sm">
                  {activeContact.name && activeContact.name !== activeContact.phone ? activeContact.name : formatPhone(activeContact.phone)}
                </h3>
                <p className="text-xs text-[#667781] dark:text-[#8696a0]">{formatPhone(activeContact.phone)}</p>
              </div>
            </div>
            
            <button 
              onClick={handleToggleBot}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isBotPaused 
                  ? 'bg-amber-100 text-amber-800 dark:bg-[#382b18] dark:text-[#ffc978] hover:bg-amber-200' 
                  : 'bg-emerald-100 text-emerald-800 dark:bg-[#0c3b2e] dark:text-[#00a884] hover:bg-emerald-200'
              }`}
              title={isBotPaused ? "Reactivar la IA para este chat" : "Pausar la IA por 5 horas (Modo Manual)"}
            >
              {isBotPaused ? (
                <>
                  <BotOff size={15} />
                  <span>Bot Pausado (5h)</span>
                </>
              ) : (
                <>
                  <Bot size={15} />
                  <span>Bot Activo</span>
                </>
              )}
            </button>
          </div>

          {/* Fondo Wallpaper WhatsApp */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{ 
              backgroundImage: 'url("https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png")', 
              opacity: 0.96 
            }}
          >
            {messages.map((msg) => {
              const isOutbound = msg.direction === 'outbound';
              return (
                <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-[13.5px] shadow-sm relative leading-relaxed ${
                    isOutbound 
                      ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none' 
                      : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none'
                  }`}>
                    {/^\[📄 .+\]$/.test(msg.content) ? (
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex-shrink-0 w-9 h-9 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
                          </svg>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[12px] font-medium truncate">
                            {msg.content.replace(/^\[📄 /, '').replace(/\]$/, '')}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-[#8696a0]">PDF · Enviado</span>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    <div className="flex items-center justify-end gap-2 mt-1.5 pt-0.5 border-t border-black/5 dark:border-white/5">
                      {msg.sender_type && msg.sender_type !== 'client' && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-450 dark:text-[#8696a0]/80">
                          {msg.sender_type === 'bot' ? '🤖 Bot' : '👤 Agente'}
                        </span>
                      )}
                      <span className="text-[9px] font-bold text-gray-400 dark:text-[#8696a0]/60">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input WhatsApp */}
          <div className="bg-[#f0f2f5] dark:bg-[#202c33] px-4 py-3 border-t border-gray-200 dark:border-[#222d34]">
            <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*,video/*,application/pdf"
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-2 text-[#54656f] dark:text-[#8696a0] hover:text-[#00a884] dark:hover:text-[#00a884] rounded-full transition-colors disabled:opacity-50"
                title="Adjuntar archivo"
              >
                <Paperclip size={20} />
              </button>

              <input 
                type="text" 
                placeholder="Escribe un mensaje aquí" 
                value={newMessage || ''}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 rounded-lg bg-white dark:bg-[#2a3942] border-none px-4 py-3 text-sm text-[#111b21] dark:text-[#e9edef] focus:outline-none shadow-sm"
              />
              
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white hover:bg-[#008f6f] disabled:opacity-50 transition-colors shrink-0"
              >
                <Send size={18} className="ml-1" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1a2329] text-center p-8 select-none">
          <div className="w-20 h-20 bg-blue-50 dark:bg-[#202c33] rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6 shadow-sm">
            <MessageSquare size={36} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-[#e9edef] mb-2">Bandeja de Entrada</h3>
          <p className="text-sm text-gray-500 dark:text-[#8696a0] max-w-sm leading-relaxed">
            Selecciona un chat de la lista izquierda para visualizar el historial, ver las respuestas del bot en vivo o responder manualmente.
          </p>
        </div>
      )}
    </div>
  );
}
