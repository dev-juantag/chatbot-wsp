"use client";

import { useState, useEffect } from "react";
import { Send, Smartphone, RotateCcw, Wifi, Battery, ShieldAlert, Sparkles, MessageCircle, HelpCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type LabMessage = {
  id: string;
  sender: 'user' | 'bot';
  content: string;
};

export default function LabPage() {
  const [messages, setMessages] = useState<LabMessage[]>([
    { id: '1', sender: 'bot', content: '¡Hola! Soy tu asistente de prueba. Escribe un mensaje aquí para simular una conversación de WhatsApp y ver cómo respondo según la configuración de tu negocio.' }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [businessName, setBusinessName] = useState("Mi Negocio");

  useEffect(() => {
    // Reloj dinámico para la barra de estado del celular mockup
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 60000);

    // Obtener nombre de la empresa
    const fetchBusinessName = async () => {
      const { data } = await supabase.from('agent_configs').select('business_name').limit(1).single();
      if (data?.business_name) {
        setBusinessName(data.business_name);
      }
    };
    fetchBusinessName();

    return () => clearInterval(interval);
  }, []);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token || ""}`
    };
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    
    const newUserMsg: LabMessage = { id: Date.now().toString(), sender: 'user', content: userMsg };
    setMessages(prev => [...prev, newUserMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/lab/chat', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ message: userMsg, history: messages })
      });
      
      const data = await res.json();
      
      if (data.success && data.response) {
        const botMsg: LabMessage = { 
          id: (Date.now() + 1).toString(), 
          sender: 'bot', 
          content: data.response.reply_text 
        };
        setMessages(prev => [...prev, botMsg]);
      }
    } catch (error) {
      console.error("Error en Lab:", error);
      const errorMsg: LabMessage = { 
        id: (Date.now() + 1).toString(), 
        sender: 'bot', 
        content: "Error de conexión con el backend." 
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([{ id: '1', sender: 'bot', content: 'Conversación reiniciada. ¡Escribe un nuevo mensaje!' }]);
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      
      {/* Panel Izquierdo: Información y Guía */}
      <div className="hidden lg:flex w-80 border-r border-gray-150 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 flex-col justify-between overflow-y-auto">
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Sparkles size={22} className="animate-spin-slow" />
            <h2 className="font-bold text-lg text-gray-900 dark:text-white">Simulador Chatbot</h2>
          </div>
          
          <p className="text-sm text-gray-500 dark:text-gray-450 leading-relaxed">
            Este entorno te permite simular la experiencia exacta que tendrá un cliente al chatear con tu negocio en WhatsApp.
          </p>

          <div className="border-t border-gray-100 dark:border-gray-700 my-4"></div>

          <div className="space-y-4">
            <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider">¿Cómo funciona?</h4>
            
            <div className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">1</div>
              <p className="text-xs text-gray-500 dark:text-gray-450">Escribe cualquier consulta o solicita agendar una cita en el celular del simulador.</p>
            </div>
            
            <div className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">2</div>
              <p className="text-xs text-gray-500 dark:text-gray-450">La IA procesará tu mensaje utilizando el rol, objetivos y servicios configurados.</p>
            </div>

            <div className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">3</div>
              <p className="text-xs text-gray-500 dark:text-gray-450">Observa las respuestas del bot en tiempo real y ajusta sus instrucciones si es necesario.</p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 flex gap-3">
          <ShieldAlert className="text-amber-600 shrink-0" size={18} />
          <div>
            <h5 className="text-xs font-bold text-amber-800 dark:text-amber-400">Pruebas en Aislado</h5>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-500/80 mt-1 leading-normal">
              Los chats y citas simuladas aquí no afectarán las estadísticas reales ni se enviarán notificaciones al WhatsApp del cliente.
            </p>
          </div>
        </div>

      </div>

      {/* Área Central: Simulador del Celular */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-950 dark:to-gray-900 relative">
        
        {/* Floating actions wrapper */}
        <div className="absolute top-6 flex items-center justify-between w-full max-w-sm px-4">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full shadow-sm border border-gray-150 dark:border-gray-700">
            <Smartphone size={13} className="text-blue-500" />
            Vista Móvil Simulada
          </span>
          <button 
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-full bg-white dark:bg-gray-800 px-4 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm border border-gray-150 dark:border-gray-700"
          >
            <RotateCcw size={12} />
            Reiniciar Chat
          </button>
        </div>

        {/* --- SMARTPHONE MOCKUP FRAME --- */}
        <div className="relative w-full max-w-[360px] h-[680px] bg-black rounded-[42px] p-3 shadow-2xl border-4 border-gray-800 dark:border-gray-700 mt-6 flex flex-col">
          
          {/* Cámara Notch / Dynamic Island */}
          <div className="absolute top-5 left-1/2 transform -translate-x-1/2 w-28 h-6 bg-black rounded-full z-35 flex items-center justify-between px-3">
            <div className="w-3 h-3 rounded-full bg-radial from-gray-800 to-black border border-gray-900"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-900/30"></div>
          </div>

          {/* Pantalla del Celular */}
          <div className="flex-1 rounded-[32px] overflow-hidden bg-[#efeae2] dark:bg-[#0b141a] flex flex-col relative border border-black/10">
            
            {/* 1. Status Bar del Celular */}
            <div className="bg-[#f0f2f5] dark:bg-[#202c33] px-5 pt-2 pb-1 flex justify-between items-center text-[10px] font-bold text-gray-800 dark:text-[#e9edef] select-none z-20">
              <span>{currentTime}</span>
              <div className="flex items-center gap-1.5">
                <Wifi size={10} />
                <span className="text-[9px]">4G</span>
                <Battery size={12} className="rotate-270" />
              </div>
            </div>

            {/* 2. Header de WhatsApp */}
            <div className="flex items-center gap-2.5 bg-[#f0f2f5] dark:bg-[#202c33] px-4 py-2 border-b border-gray-200/50 dark:border-[#222d34] shadow-sm z-20">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shrink-0 shadow-md">
                <MessageCircle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-gray-800 dark:text-[#e9edef] truncate leading-tight">
                  {businessName}
                </h3>
                <span className="text-[9px] text-green-600 dark:text-green-400 font-bold block leading-none mt-0.5 animate-pulse">en línea</span>
              </div>
            </div>

            {/* 3. Área de Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 z-10" style={{ backgroundImage: 'url("https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png")', opacity: 0.9 }}>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-sm relative leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none' 
                        : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <span className="text-[8px] text-gray-400 float-right mt-1 ml-4 select-none opacity-80">
                      {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-[#202c33] text-gray-450 dark:text-gray-400 rounded-2xl rounded-tl-none px-3.5 py-2 shadow-sm text-xs flex gap-1 items-center font-medium">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-150"></span>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-300"></span>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Barra de Input de Texto */}
            <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-2 flex gap-2 items-center border-t border-gray-200/40 dark:border-[#222d34] z-20">
              <form onSubmit={handleSend} className="flex-1 flex gap-1.5 items-center">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe un mensaje..." 
                  className="flex-1 rounded-full bg-white dark:bg-[#2a3942] border-none px-4 py-2.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:ring-0 shadow-inner"
                  disabled={isLoading}
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00a884] text-white hover:bg-[#008f6f] disabled:opacity-50 transition-colors shrink-0 shadow"
                >
                  <Send size={13} className="ml-0.5" />
                </button>
              </form>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
