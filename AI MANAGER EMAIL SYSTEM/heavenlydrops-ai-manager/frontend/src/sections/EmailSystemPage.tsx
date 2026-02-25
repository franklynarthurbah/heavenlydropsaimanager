/**
 * Email System Dashboard
 * Heavenly Drops AI Manager
 *
 * Shows:
 *  - Mail server health (SMTP, IMAP, SSL, Roundcube)
 *  - Live email stats (24h inbound/outbound, attachments, forms)
 *  - AI vs Human detection breakdown
 *  - Attachment processing queue
 *  - Auto-updater progress / maintenance mode overlay
 *  - Pending AI-reply approvals
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface DiagnosticCheck {
  check_type: string;
  status: 'ok' | 'warning' | 'error';
  details: Record<string, unknown>;
  error_msg?: string;
  duration_ms: number;
  checked_at: string;
}

interface MailHealth {
  status: string;
  lastChecked: string;
  checks: DiagnosticCheck[];
}

interface EmailStats {
  total: number;
  byDirection: Record<string, number>;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  openRate: number;
  clickRate: number;
}

interface UpdaterStatus {
  status: string;
  message: string;
  progress: number;
  component?: string;
}

interface DashboardData {
  emailStats: EmailStats;
  mailServerHealth: MailHealth;
  updaterStatus: UpdaterStatus;
  timestamp: string;
}

interface PendingApproval {
  id: string;
  fromAddress: string;
  subject: string;
  aiGeneratedContent: string;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const statusColor = (s: string) => {
  if (s === 'ok') return 'text-green-400';
  if (s === 'warning') return 'text-yellow-400';
  return 'text-red-400';
};

const statusBg = (s: string) => {
  if (s === 'ok') return 'bg-green-900/30 border-green-700';
  if (s === 'warning') return 'bg-yellow-900/30 border-yellow-700';
  return 'bg-red-900/30 border-red-700';
};

const checkLabel: Record<string, string> = {
  smtp_send: 'SMTP Send',
  imap_login: 'IMAP Login',
  ssl_cert: 'SSL Certificate',
  roundcube_health: 'Roundcube Web',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function EmailSystemPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [runningUpdater, setRunningUpdater] = useState(false);
  const [approvalExpanded, setApprovalExpanded] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const [dash, approvals] = await Promise.all([
        api.get('/emails/dashboard'),
        api.get('/emails/pending-approvals'),
      ]);
      setDashboard(dash.data);
      setPendingApprovals(approvals.data ?? []);
    } catch (e) {
      console.error('Dashboard fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Poll updater status while update is running
  useEffect(() => {
    if (!runningUpdater) return;
    const interval = setInterval(async () => {
      const res = await api.get('/emails/updater/status');
      const s = res.data as UpdaterStatus;
      setDashboard(prev => prev ? { ...prev, updaterStatus: s } : prev);
      if (s.status === 'done' || s.status === 'failed' || s.status === 'idle') {
        setRunningUpdater(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [runningUpdater]);

  const handleRunDiagnostics = async () => {
    setRunningDiagnostics(true);
    await api.post('/emails/diagnostics/run', { beforeAfter: true });
    await fetchDashboard();
    setRunningDiagnostics(false);
  };

  const handleRunUpdater = async () => {
    setRunningUpdater(true);
    await api.post('/emails/updater/run', {});
  };

  const handleApprove = async (id: string) => {
    await api.post(`/emails/${id}/approve`, {});
    setPendingApprovals(prev => prev.filter(a => a.id !== id));
  };

  const updater = dashboard?.updaterStatus;
  const isMaintenanceMode = updater?.status === 'installing' || updater?.status === 'repairing';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 text-lg animate-pulse">Loading email system…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 relative">
      {/* ── Maintenance Mode Overlay ─────────────────────────── */}
      {isMaintenanceMode && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center gap-6">
          <div className="text-4xl">⚙️</div>
          <h2 className="text-white text-2xl font-bold">System Update in Progress</h2>
          <p className="text-gray-300">{updater?.message}</p>
          <div className="w-80 bg-gray-700 rounded-full h-4 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${updater?.progress ?? 0}%` }}
            />
          </div>
          <p className="text-gray-400 text-sm">{updater?.progress ?? 0}% complete</p>
          {updater?.component && (
            <p className="text-blue-300 text-sm">Updating: {updater.component}</p>
          )}
          <p className="text-gray-500 text-xs mt-2">All functions will resume automatically</p>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📧 Email System</h1>
          <p className="text-gray-400 text-sm mt-1">
            workandstudyabroad.com.tr · Roundcube Webmail · IMAP/SMTP
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRunDiagnostics}
            disabled={runningDiagnostics}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {runningDiagnostics ? '⟳ Running…' : '🔍 Run Diagnostics'}
          </button>
          <button
            onClick={handleRunUpdater}
            disabled={runningUpdater}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {runningUpdater ? '⟳ Updating…' : '🔄 Check Updates'}
          </button>
          <a
            href="https://webmail.workandstudyabroad.com.tr"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            🌐 Open Webmail
          </a>
        </div>
      </div>

      {/* ── Mail Server Health ─────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Mail Server Health</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(dashboard?.mailServerHealth?.checks ?? []).map(check => (
            <div
              key={check.check_type}
              className={`rounded-xl border p-4 ${statusBg(check.status)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300 text-sm font-medium">
                  {checkLabel[check.check_type] ?? check.check_type}
                </span>
                <span className={`text-xs font-bold uppercase ${statusColor(check.status)}`}>
                  {check.status}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {check.duration_ms}ms ·{' '}
                {new Date(check.checked_at).toLocaleTimeString()}
              </div>
              {check.error_msg && (
                <div className="mt-2 text-xs text-red-400 truncate" title={check.error_msg}>
                  {check.error_msg}
                </div>
              )}
              {check.check_type === 'ssl_cert' && (check.details as any)?.daysUntilExpiry != null && (
                <div className="mt-1 text-xs text-gray-400">
                  {(check.details as any).daysUntilExpiry}d until expiry
                </div>
              )}
            </div>
          ))}
          {(!dashboard?.mailServerHealth?.checks?.length) && (
            <div className="col-span-4 text-gray-500 text-sm py-4 text-center">
              No diagnostic data yet. Click "Run Diagnostics" to start.
            </div>
          )}
        </div>
      </section>

      {/* ── 24h Email Stats ────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Email Activity (All Time)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total Emails', value: dashboard?.emailStats?.total ?? 0, icon: '✉️' },
            { label: 'Inbound', value: dashboard?.emailStats?.byDirection?.inbound ?? 0, icon: '📥' },
            { label: 'Outbound', value: dashboard?.emailStats?.byDirection?.outbound ?? 0, icon: '📤' },
            { label: 'Open Rate', value: `${(dashboard?.emailStats?.openRate ?? 0).toFixed(1)}%`, icon: '👁️' },
            {
              label: 'Pending Approvals',
              value: pendingApprovals.length,
              icon: '⏳',
              highlight: pendingApprovals.length > 0,
            },
          ].map(stat => (
            <div
              key={stat.label}
              className={`rounded-xl border p-4 ${stat.highlight ? 'bg-yellow-900/30 border-yellow-700' : 'bg-gray-800 border-gray-700'}`}
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-gray-400 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Company Email Accounts ─────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Company Accounts</h2>
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left px-4 py-3">Email Address</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Webmail</th>
              </tr>
            </thead>
            <tbody>
              {[
                { email: 'info@workandstudyabroad.com.tr', role: 'Staff', desc: 'General inquiries' },
                { email: 'support@workandstudyabroad.com.tr', role: 'Staff', desc: 'Customer support' },
                { email: 'sales@workandstudyabroad.com.tr', role: 'Staff', desc: 'Sales team' },
                { email: 'admin@workandstudyabroad.com.tr', role: 'Admin', desc: 'System administration' },
                { email: 'noreply@workandstudyabroad.com.tr', role: 'System', desc: 'Automated sends' },
              ].map(account => (
                <tr key={account.email} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-blue-300 font-mono">{account.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      account.role === 'Admin' ? 'bg-purple-900/50 text-purple-300' :
                      account.role === 'System' ? 'bg-gray-700 text-gray-400' :
                      'bg-blue-900/50 text-blue-300'
                    }`}>
                      {account.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href="https://webmail.workandstudyabroad.com.tr"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      Open ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Pending AI Approvals ───────────────────────────────── */}
      {pendingApprovals.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            ⏳ Pending AI Reply Approvals ({pendingApprovals.length})
          </h2>
          <div className="space-y-3">
            {pendingApprovals.map(approval => (
              <div key={approval.id} className="bg-yellow-900/20 border border-yellow-700 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{approval.subject}</div>
                    <div className="text-gray-400 text-sm">{approval.fromAddress}</div>
                  </div>
                  <div className="flex gap-2 ml-4 flex-shrink-0">
                    <button
                      onClick={() => setApprovalExpanded(
                        approvalExpanded === approval.id ? null : approval.id,
                      )}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition-colors"
                    >
                      {approvalExpanded === approval.id ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      onClick={() => handleApprove(approval.id)}
                      className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      ✓ Approve & Send
                    </button>
                  </div>
                </div>
                {approvalExpanded === approval.id && (
                  <div
                    className="mt-3 text-sm text-gray-300 border-t border-yellow-700/40 pt-3 prose prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: approval.aiGeneratedContent }}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Auto-Updater Status ────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Auto-Updater</h2>
        <div className={`rounded-xl border p-4 ${
          updater?.status === 'done' ? 'bg-green-900/20 border-green-700' :
          updater?.status === 'failed' ? 'bg-red-900/20 border-red-700' :
          updater?.status === 'idle' ? 'bg-gray-800 border-gray-700' :
          'bg-blue-900/20 border-blue-700'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium capitalize">
                {updater?.status ?? 'idle'} — {updater?.message || 'No update in progress'}
              </div>
              <div className="text-gray-400 text-sm mt-1">
                Components: Roundcube · WhatsApp API · Instagram API · NestJS Core
              </div>
            </div>
            {(updater?.status === 'checking' || updater?.status === 'installing' || updater?.status === 'repairing') && (
              <div className="flex-shrink-0 ml-4">
                <div className="w-32 bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${updater?.progress ?? 0}%` }}
                  />
                </div>
                <div className="text-center text-xs text-gray-500 mt-1">{updater?.progress ?? 0}%</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Quick Links ────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Quick Links</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Webmail Interface', url: 'https://webmail.workandstudyabroad.com.tr', icon: '🌐' },
            { label: 'SMTP Port 587', url: '#', icon: '📡', badge: 'TLS' },
            { label: 'IMAP Port 993', url: '#', icon: '📬', badge: 'SSL' },
            { label: 'SSL Certificate', url: '#', icon: '🔒', badge: 'Let\'s Encrypt' },
          ].map(link => (
            <a
              key={link.label}
              href={link.url}
              target={link.url !== '#' ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-xl p-4 transition-colors flex items-center gap-3"
            >
              <span className="text-2xl">{link.icon}</span>
              <div>
                <div className="text-white text-sm font-medium">{link.label}</div>
                {link.badge && (
                  <span className="text-xs text-green-400">{link.badge}</span>
                )}
              </div>
            </a>
          ))}
        </div>
      </section>

      <p className="text-gray-600 text-xs text-right">
        Last refreshed: {dashboard?.timestamp ? new Date(dashboard.timestamp).toLocaleString() : '—'}
        {' · '}Auto-refreshes every 30s
      </p>
    </div>
  );
}
