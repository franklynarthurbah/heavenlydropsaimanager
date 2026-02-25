import { useEffect, useState } from 'react';
import { leadsApi } from '../lib/api';
import type { DashboardStats } from '../types';
import { Users, TrendingUp, Calendar, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatLeadStatus } from '../lib/utils';

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    leadsApi.getStats()
      .then((res) => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const statusChartData = stats
    ? Object.entries(stats.byStatus).map(([status, count]) => ({
        name: formatLeadStatus(status),
        count,
      }))
    : [];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Overview of your AI manager performance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard
          icon={<Users className="w-5 h-5 text-blue-600" />}
          bg="bg-blue-50"
          label="Total Leads"
          value={loading ? '…' : (stats?.totalLeads ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-green-600" />}
          bg="bg-green-50"
          label="New This Week"
          value={loading ? '…' : (stats?.newLeadsThisWeek ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-purple-600" />}
          bg="bg-purple-50"
          label="Converted (Month)"
          value={loading ? '…' : (stats?.convertedThisMonth ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<Calendar className="w-5 h-5 text-orange-600" />}
          bg="bg-orange-50"
          label="Appointments"
          value={loading ? '…' : (stats?.byStatus?.['appointment_scheduled'] ?? 0).toLocaleString()}
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Leads by Status</h2>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400">Loading chart…</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={statusChartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  bg,
  label,
  value,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
      <div className={`${bg} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
