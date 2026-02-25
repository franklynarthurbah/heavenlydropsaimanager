import { useEffect, useState } from 'react';
import { conversationsApi } from '../lib/api';
import type { Conversation } from '../types';
import { formatDateTime } from '../lib/utils';
import { MessageSquare, Instagram } from 'lucide-react';

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <span className="text-green-500">💬</span>,
  instagram: <Instagram className="w-4 h-4 text-pink-500" />,
  email: <span>📧</span>,
  voice: <span>📞</span>,
};

export function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    conversationsApi.getAll({ limit: 50 })
      .then((res) => setConversations(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Conversations</h1>
        <p className="text-slate-500 text-sm mt-1">All AI-managed conversations across channels</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading conversations…</div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400">No conversations yet.</p>
            <p className="text-slate-300 text-sm mt-1">Conversations will appear here once leads start messaging.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-500">Channel</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Lead ID</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conv) => (
                <tr key={conv.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {CHANNEL_ICONS[conv.channel] ?? '💬'}
                      <span className="capitalize text-slate-700">{conv.channel}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-500 font-mono text-xs">{conv.leadId.slice(0, 8)}…</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      conv.status === 'open' ? 'bg-green-100 text-green-800' :
                      conv.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {conv.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{formatDateTime(conv.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
