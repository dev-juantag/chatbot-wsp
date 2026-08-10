"use client";

import { Settings } from "lucide-react";
import UnifiedSettingsForm from "./components/UnifiedSettingsForm";

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto">
        {/* Cabecera */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl">
              <Settings size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración</h1>
              <p className="text-gray-500 dark:text-gray-400">Configura los datos del negocio, comportamiento y personalidad del Agente de Inteligencia Artificial.</p>
            </div>
          </div>
        </div>

        {/* Panel Único de Configuración */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 md:p-8 min-h-[500px]">
          <UnifiedSettingsForm />
        </div>
      </div>
    </div>
  );
}
