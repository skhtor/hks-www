import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

interface SyncError {
  id: string;
  entityType: string;
  entityId: string;
  errorMessage: string;
  retryCount: number;
  createdAt: string;
  resolvedAt?: string;
}

interface SyncLog {
  id: string;
  operation: string;
  status: string;
  entityType?: string;
  entityId?: string;
  errorMessage?: string;
  createdAt: string;
}

type Tab = 'errors' | 'history';

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    retrying: 'bg-blue-100 text-blue-800',
  };
  const cls = colors[status.toLowerCase()] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function SyncErrorsTab() {
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchErrors = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/xero/sync-errors');
      const raw = res.data;
      const items: SyncError[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.errors)
          ? raw.errors
          : Array.isArray(raw?.data)
            ? raw.data
            : [];
      setErrors(items);
    } catch {
      setError('Failed to load sync errors.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchErrors(); }, []);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    try {
      await apiClient.post(`/xero/sync-errors/${id}/retry`);
      await fetchErrors();
    } catch {
      setError('Failed to retry sync.');
    } finally {
      setRetrying(null);
    }
  };

  const handleRetryAll = async () => {
    setRetrying('all');
    try {
      await apiClient.post('/xero/sync-errors/retry-all');
      await fetchErrors();
    } catch {
      setError('Failed to retry all syncs.');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">
          {errors.length} unresolved error{errors.length !== 1 ? 's' : ''}
        </p>
        {errors.length > 0 && (
          <button
            onClick={handleRetryAll}
            disabled={retrying !== null}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {retrying === 'all' ? 'Retrying...' : 'Retry All'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : errors.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium">No sync errors</p>
          <p className="text-sm mt-1">All Xero syncs are up to date.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Entity</th>
                <th className="px-4 py-3 text-left">Error</th>
                <th className="px-4 py-3 text-right">Retries</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {errors.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{e.entityType}</div>
                    <div className="text-xs text-gray-500">{e.entityId}</div>
                  </td>
                  <td className="px-4 py-3 text-red-600 max-w-xs truncate">{e.errorMessage}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{e.retryCount}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRetry(e.id)}
                      disabled={retrying !== null}
                      className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs rounded hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {retrying === e.id ? 'Retrying...' : 'Retry'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SyncHistoryTab() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient
      .get('/xero/sync-logs')
      .then((res) => {
        const raw = res.data;
        const items: SyncLog[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.logs)
            ? raw.logs
            : Array.isArray(raw?.data)
              ? raw.data
              : [];
        setLogs(items);
      })
      .catch(() => setError('Failed to load sync history.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : logs.length === 0 ? (
        <p className="text-gray-500 text-sm">No sync history available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Operation</th>
                <th className="px-4 py-3 text-left">Entity</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Message</th>
                <th className="px-4 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{log.operation}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {log.entityType ? `${log.entityType} ${log.entityId ?? ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {log.errorMessage ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function XeroSyncPage() {
  const [activeTab, setActiveTab] = useState<Tab>('errors');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Xero Sync Management</h1>
      <p className="text-gray-600 mb-6">Monitor and manage Xero synchronisation errors and history.</p>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1" aria-label="Xero sync tabs">
          <TabButton label="Sync Errors" active={activeTab === 'errors'} onClick={() => setActiveTab('errors')} />
          <TabButton label="Sync History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        </nav>
      </div>

      {activeTab === 'errors' && <SyncErrorsTab />}
      {activeTab === 'history' && <SyncHistoryTab />}
    </div>
  );
}
