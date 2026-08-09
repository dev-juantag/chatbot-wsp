"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Bot, Eye, EyeOff, KeyRound, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";

type Mode = "login" | "forgot" | "verify" | "reset";

export default function LoginPage() {
  const router = useRouter();

  // Navigation / Mode State
  const [mode, setMode] = useState<Mode>("login");

  // Form Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Recovery Specific Fields
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Status & Feedback States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Countdown timer for 5 minutes code expiry
  const [timerSeconds, setTimerSeconds] = useState(300);
  const [isTimerActive, setIsTimerActive] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setIsTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [isTimerActive, timerSeconds]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 1. Manejo de Inicio de Sesión
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      const errMsg = authError.message.toLowerCase();
      if (errMsg.includes("invalid login credentials")) {
        setError("Correo electrónico o contraseña incorrectos.");
      } else if (errMsg.includes("database error") || errMsg.includes("schema") || errMsg.includes("query")) {
        setError("Error en el servidor de autenticación. Intenta nuevamente.");
      } else {
        setError(authError.message);
      }
      setLoading(false);
    } else {
      // Verificar si el usuario está activo en la tabla public.users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_active')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (userData && userData.is_active === false) {
        // Bloquear acceso y cerrar sesión
        await supabase.auth.signOut();
        setError("Tu cuenta ha sido desactivada o se encuentra restringida. Por favor, contacta al administrador del negocio.");
        setLoading(false);
      } else {
        router.push("/dashboard");
      }
    }
  };

  // 2. Solicitud de código de recuperación (SMTP Zoho)
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("http://localhost:3001/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el código.");

      setSuccessMsg("Código de 6 dígitos enviado a tu correo.");
      setTimerSeconds(300); // 5 minutos
      setIsTimerActive(true);
      setMode("verify");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Verificación de Código de 6 dígitos
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.length !== 6) {
      setError("Por favor ingresa el código completo de 6 dígitos.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:3001/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Código inválido.");

      setSuccessMsg("Código verificado. Ingresa tu nueva contraseña.");
      setMode("reset");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 4. Establecer Nueva Contraseña
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:3001/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar contraseña.");

      setSuccessMsg("¡Contraseña actualizada exitosamente! Ya puedes ingresar.");
      setPassword(newPassword);
      setMode("login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-gradient-to-b from-gray-50 via-blue-50/40 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 px-4 py-8 select-none">
      
      {/* Spacer central para centrado perfecto */}
      <div className="flex-1 flex items-center justify-center w-full my-auto">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 sm:p-10 rounded-[2.5rem] shadow-xl border border-gray-100/80 dark:border-gray-700/60 transition-all">
          
          {/* Header con Icono Bot de la App */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white mb-4 mx-auto shadow-lg shadow-blue-500/25">
              <Bot size={36} className="animate-pulse" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Chatbot CRM
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
              Sistema de Inteligencia Artificial para WhatsApp
            </p>
          </div>

          {/* Alert de Error / Éxito */}
          {error && (
            <div className="mb-6 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 rounded-xl text-xs text-center font-medium">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs text-center font-medium flex items-center justify-center gap-2">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* VISTA 1: INICIAR SESIÓN */}
          {mode === "login" && (
            <div>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 text-center mb-6">
                Iniciar sesión
              </h2>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="text-left">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="correo@techtag.dev"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700 transition-all"
                  />
                </div>

                <div className="text-left relative">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Ingrese su contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-11 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-full shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : "Ingresar"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setMode("forgot");
                  }}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline transition-all"
                >
                  ¿Olvidó su contraseña?
                </button>
              </div>
            </div>
          )}

          {/* VISTA 2: RECUPERAR CONTRASEÑA (SOLICITAR CÓDIGO) */}
          {mode === "forgot" && (
            <div>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 text-center mb-2">
                Recuperar contraseña
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6 leading-relaxed">
                Ingresa tu correo para recibir un código de verificación de 6 dígitos.
              </p>

              <form onSubmit={handleSendCode} className="space-y-5">
                <div className="text-left">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="juantaguado05@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-full shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : "Enviar código"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setMode("login");
                  }}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft size={14} />
                  Volver al inicio de sesión
                </button>
              </div>
            </div>
          )}

          {/* VISTA 3: INGRESAR CÓDIGO DE 6 DÍGITOS */}
          {mode === "verify" && (
            <div>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 text-center mb-2">
                Código de Verificación
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4 leading-relaxed">
                Ingresa el código de 6 dígitos que enviamos a <strong className="text-gray-700 dark:text-gray-200">{email}</strong>.
              </p>

              <div className="text-center mb-6">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full text-xs font-mono font-bold">
                  El código expira en: {formatTimer(timerSeconds)}
                </span>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div className="text-center">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="750371"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full tracking-[0.5em] text-center text-2xl font-mono font-bold py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6 || timerSeconds === 0}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-full shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : "Verificar código"}
                </button>
              </form>

              <div className="mt-6 text-center space-y-2">
                {timerSeconds === 0 && (
                  <button
                    type="button"
                    onClick={handleSendCode}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline block w-full"
                  >
                    Reenviar nuevo código
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setMode("login");
                  }}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft size={14} />
                  Volver al inicio de sesión
                </button>
              </div>
            </div>
          )}

          {/* VISTA 4: ESTABLECER NUEVA CONTRASEÑA */}
          {mode === "reset" && (
            <div>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 text-center mb-2 flex items-center justify-center gap-2">
                <KeyRound size={20} className="text-blue-600" />
                Nueva Contraseña
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6">
                Ingresa tu nueva clave de acceso para actualizar tu cuenta.
              </p>

              <form onSubmit={handleResetPassword} className="space-y-5">
                <div className="text-left relative">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      required
                      minLength={6}
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-11 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="text-left">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                    Confirmar nueva contraseña
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Repite la contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-full shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : "Actualizar Contraseña"}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-gray-400 dark:text-gray-500 font-medium">
        © 2026 desarrollado por Juan Taguado | Todos los derechos reservados
      </footer>
    </div>
  );
}
