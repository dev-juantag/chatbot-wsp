"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { Calendar as CalendarIcon, Clock, User, CheckCircle, XCircle } from "lucide-react";
import { parsePhoneNumberFromString } from 'libphonenumber-js';

type Appointment = {
  id: string;
  contact_id: string;
  service_name: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:mm:ss
  status: string;
  contact?: { name: string; phone: string };
};

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

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

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    const { data } = await supabase
      .from("appointments")
      .select("*, contact:contacts(name, phone)")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });
    if (data) setAppointments(data as any);
  };

  // Filtrar citas para el día seleccionado
  const selectedDateString = selectedDate.toISOString().split("T")[0];
  const dayAppointments = appointments.filter(app => app.appointment_date === selectedDateString);

  // Identificar qué días tienen citas para marcarlos en el calendario
  const datesWithAppointments = new Set(appointments.map(app => app.appointment_date));

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completada': return <CheckCircle className="text-emerald-500 w-5 h-5" />;
      case 'cancelada': return <XCircle className="text-red-500 w-5 h-5" />;
      default: return <Clock className="text-blue-500 w-5 h-5" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completada': return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      case 'cancelada': return 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800';
      default: return 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <style dangerouslySetInnerHTML={{__html: `
        /* React Calendar Custom Overrides */
        .react-calendar {
          width: 100%;
          border: none;
          background: transparent;
          font-family: inherit;
        }
        .react-calendar__navigation button {
          color: #374151;
          font-weight: 600;
          font-size: 1.1rem;
          border-radius: 0.5rem;
        }
        .dark .react-calendar__navigation button {
          color: #f3f4f6;
        }
        .react-calendar__navigation button:disabled {
          background-color: transparent;
        }
        .react-calendar__navigation button:enabled:hover,
        .react-calendar__navigation button:enabled:focus {
          background-color: #f3f4f6;
        }
        .dark .react-calendar__navigation button:enabled:hover,
        .dark .react-calendar__navigation button:enabled:focus {
          background-color: #374151;
        }
        .react-calendar__month-view__weekdays {
          text-transform: capitalize;
          font-weight: 600;
          font-size: 0.85rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }
        .dark .react-calendar__month-view__weekdays {
          color: #9ca3af;
        }
        .react-calendar__month-view__weekdays__weekday abbr {
          text-decoration: none;
        }
        .react-calendar__tile {
          padding: 1rem 0.5rem;
          background: none;
          text-align: center;
          font-weight: 500;
          border-radius: 0.5rem;
          color: #374151;
          transition: all 0.2s;
        }
        .dark .react-calendar__tile {
          color: #d1d5db;
        }
        .react-calendar__tile:disabled {
          background-color: transparent;
          color: #d1d5db;
        }
        .dark .react-calendar__tile:disabled {
          color: #4b5563;
        }
        .react-calendar__tile:enabled:hover,
        .react-calendar__tile:enabled:focus {
          background-color: #f3f4f6;
        }
        .dark .react-calendar__tile:enabled:hover,
        .dark .react-calendar__tile:enabled:focus {
          background-color: #374151;
        }
        .react-calendar__tile--now {
          background-color: #eff6ff;
          color: #2563eb;
        }
        .dark .react-calendar__tile--now {
          background-color: #1e3a8a;
          color: #bfdbfe;
        }
        .react-calendar__tile--active,
        .react-calendar__tile--active:enabled:hover,
        .react-calendar__tile--active:enabled:focus {
          background-color: #2563eb;
          color: white;
          box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.39);
        }
        .dark .react-calendar__tile--active,
        .dark .react-calendar__tile--active:enabled:hover,
        .dark .react-calendar__tile--active:enabled:focus {
          background-color: #3b82f6;
          color: white;
        }
        
        .appointment-dot {
          height: 6px;
          width: 6px;
          background-color: #3b82f6;
          border-radius: 50%;
          display: inline-block;
          margin-top: 4px;
        }
      `}} />

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Citas</h1>
        <p className="text-gray-500 dark:text-gray-400">Selecciona un día en el calendario para ver las citas programadas.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Calendario */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <Calendar
              onChange={(value) => setSelectedDate(value as Date)}
              value={selectedDate}
              locale="es-ES"
              className="w-full"
              tileContent={({ date, view }) => {
                if (view === 'month') {
                  const dateStr = date.toISOString().split("T")[0];
                  if (datesWithAppointments.has(dateStr)) {
                    return <div className="flex justify-center"><span className="appointment-dot"></span></div>;
                  }
                }
                return null;
              }}
            />
          </div>
        </div>

        {/* Lista de citas del día */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
            <CalendarIcon size={24} className="text-blue-500" />
            Agenda para el {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          
          {dayAppointments.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 border-dashed p-12 flex flex-col items-center justify-center text-center h-64">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <CalendarIcon className="text-gray-400" size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Día libre</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm">No hay ninguna cita programada para esta fecha.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dayAppointments.map(app => (
                <div key={app.id} className={`bg-white dark:bg-gray-800 rounded-2xl border ${getStatusBg(app.status)} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-md`}>
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {getStatusIcon(app.status)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{app.service_name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-gray-600 dark:text-gray-300">
                        <User size={16} />
                        <span>{app.contact?.name && app.contact.name !== 'Cliente' ? app.contact.name : formatPhone(app.contact?.phone || '')}</span>
                      </div>
                      {app.contact?.name && app.contact.name !== 'Cliente' && (
                        <p className="text-sm text-gray-500 mt-0.5 ml-6">{formatPhone(app.contact.phone)}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:items-end justify-center bg-white/50 dark:bg-gray-900/50 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Hora</div>
                    <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                      {app.appointment_time.substring(0, 5)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
