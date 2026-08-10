"use client";

import { QrCode, AlertCircle, RefreshCw, LogOut, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function WhatsAppConnectionPage() {
  const [status, setStatus] = useState<string>("loading");
  const [sessionData, setSessionData] = useState<any>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const checkStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus('disconnected'); return; }

      // 1. Buscar tenant_id del usuario actual
      const { data: userRecord } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', session.user.id)
        .maybeSingle();

      const tenantId = userRecord?.tenant_id || session.user.user_metadata?.tenant_id;

      // 2. Si hay tenantId, consultar si la sesión figura como CONNECTED en Supabase
      if (tenantId) {
        const { data: wsDb } = await supabase
          .from('whatsapp_sessions')
          .select('status, session_data')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (wsDb?.status === 'CONNECTED') {
          let parsed: any = {};
          try { parsed = wsDb.session_data ? JSON.parse(wsDb.session_data) : {}; } catch {}
          setStatus('ready');
          setSessionData({
            phone: parsed.phone || '+573148665535',
            pushName: parsed.pushName || 'JuanF'
          });
          // No hacemos return temprano. Hacemos la consulta al backend en segundo plano
          // para asegurarnos de que la conexión real en OpenWA siga activa.
        }
      }

      // 3. Consultar backend Express / OpenWA para obtener el estado real
      const res = await fetch('/api/backend/whatsapp/status', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (res.ok) {
        const data = await res.json();
        // 'starting' significa que el motor arrancó en segundo plano, mostramos pantalla de espera QR
        setStatus(data.status || 'disconnected');
        setSessionData(data);
      } else {
        setStatus('disconnected');
      }
    } catch (e: any) {
      setStatus('disconnected');
    }
  };

  const handleRetry = async () => {
    setStatus('loading');
    setSessionData(null);
    await checkStatus();
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 6000); // Polling activo cada 6s para ver escaneo
    return () => clearInterval(interval);
  }, []);

  const handleDisconnect = async () => {
    if (!confirm("¿Estás seguro de que deseas desconectar la conexión de WhatsApp del chatbot?")) return;

    setDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/backend/whatsapp/disconnect", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });

      if (!res.ok) throw new Error("No se pudo desconectar.");

      setStatus("loading");
      setSessionData(null);
      // Refrescar estado para generar una sesión limpia
      setTimeout(() => {
        checkStatus();
      }, 1500);
    } catch (err: any) {
      alert(err.message || "Error al desconectar.");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <QrCode className="text-green-500" size={28} />
          Conexión de WhatsApp
        </h1>
        <p className="text-gray-500 dark:text-gray-400">Escanea el código QR para vincular tu número empresarial al CRM</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col min-h-[500px]">
        
        {status === "loading" ? (
           <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
             <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mb-4" />
             <h3 className="text-xl font-medium text-gray-900 dark:text-white">Verificando estado de tu negocio...</h3>
           </div>
        ) : status === "error" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Error de conexión</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
              No fue posible establecer comunicación con el servidor de WhatsApp.
            </p>
            <button
              onClick={checkStatus}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
            >
              Reintentar
            </button>
          </div>
        ) : status === "ready" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-green-50/50 dark:bg-green-900/20">
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-500/30">
               <QrCode className="w-12 h-12 text-white" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">¡WhatsApp Conectado!</h3>
            <p className="text-green-600 dark:text-green-400 font-medium text-lg mb-8">
              {sessionData?.pushName} ({sessionData?.phone})
            </p>
            <div className="flex flex-col items-center gap-4">
              <div className="px-6 py-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-green-200 dark:border-green-800">
                 <span className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-2 text-sm">
                   <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                   Sistema en línea y respondiendo automáticamente
                 </span>
              </div>
              
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-semibold rounded-xl text-xs hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
              >
                {disconnecting ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                Desconectar WhatsApp de este negocio
              </button>
            </div>
          </div>
        ) : (status === 'starting' || (!sessionData?.qrCode && status === 'qr_ready')) ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-gray-900/50">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 max-w-md w-full flex flex-col items-center">
              <div className="w-64 h-64 bg-gray-100 dark:bg-gray-700 rounded-2xl flex flex-col items-center justify-center mb-6 border-2 border-dashed border-emerald-300 dark:border-emerald-700">
                <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mb-2" />
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Iniciando motor WhatsApp...</span>
                <span className="text-xs text-gray-400 mt-1">El QR aparecerá en unos segundos</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 rounded-full border border-emerald-200 dark:border-emerald-900">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
                Generando código QR...
              </div>
            </div>
          </div>
        ) : sessionData?.qrCode ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900/50 w-full text-center">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 max-w-md w-full flex flex-col items-center">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mb-3">
                <QrCode size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Escanea el Código QR</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular un dispositivo y apunta con tu cámara a la pantalla.
              </p>
              <div className="p-4 bg-white rounded-2xl border-4 border-emerald-500 shadow-md mb-6 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={sessionData.qrCode} 
                  alt="Código QR de WhatsApp" 
                  className="w-64 h-64 object-contain rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 rounded-full border border-emerald-200 dark:border-emerald-900">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
                Esperando escaneo en vivo...
              </div>
            </div>
          </div>
        ) : status === 'disconnected' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-gray-900/50">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-5">
              <QrCode className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">WhatsApp no conectado</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
              Haz clic en el botón para iniciar el motor de WhatsApp y obtener tu código QR de vinculación.
            </p>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              <RefreshCw size={16} />
              Generar código QR
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-gray-900/50">
            <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
            <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">Iniciando sesión de WhatsApp...</h3>
          </div>
        )}
      </div>
    </div>
  );
}
