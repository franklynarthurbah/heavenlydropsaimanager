import { useEffect, useState } from 'react';
import { appointmentsApi } from '../lib/api';
import type { Appointment } from '../types';
import { formatDateTime } from '../lib/utils';
import { Calendar, Plus } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-gray-100 text-gray-800',
};

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    appointmentsApi.getAll({ limit: 50 })
      .then((res) => setAppointments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="text-slate-500 text-sm mt-1">Scheduled consultations and follow-ups</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading appointments…</div>
        ) : appointments.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400">No appointments scheduled.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-500">Title</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Type</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Scheduled</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Duration</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appt) => (
                <tr key={appt.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900">{appt.title}</td>
                  <td className="px-5 py-3 text-slate-500 capitalize">{appt.type.replace('_', ' ')}</td>
                  <td className="px-5 py-3 text-slate-500">{formatDateTime(appt.scheduledAt)}</td>
                  <td className="px-5 py-3 text-slate-400">{appt.duration} min</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[appt.status] ?? 'bg-gray-100 text-gray-800'}`}>
                      {appt.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
