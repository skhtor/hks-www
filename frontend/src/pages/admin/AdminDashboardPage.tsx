import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

interface Metrics {
  activeEnrolments: number | null;
  revenueThisMonth: number | null;
  outstandingInvoices: number | null;
}

interface XeroStatus {
  connected: boolean;
  lastSyncAt: string | null;
  pendingCount?: number;
  errorCount?: number;
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics>({
    activeEnrolments: null,
    revenueThisMonth: null,
    outstandingInvoices: null,
  });
  const [xeroStatus, setXeroStatus] = useState<XeroStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const results = await Promise.allSettled([
        apiClient.get('/reports/enrolments'),
        apiClient.get('/reports/revenue'),
        apiClient.get('/reports/outstanding'),
        apiClient.get('/admin/xero/status').catch(() => apiClient.get('/xero/status')),
      ]);

      const [enrolRes, revRes, outRes, xeroRes] = results;

      setMetrics({
        activeEnrolments:
          enrolRes.status === 'fulfilled'
            ? (enrolRes.value.data?.total ?? enrolRes.value.data?.count ?? null)
            : null,
        revenueThisMonth:
          revRes.status === 'fulfilled'
            ? (revRes.value.data?.total ?? revRes.value.data?.revenue ?? null)
            : null,
        outstandingInvoices:
          outRes.status === 'fulfilled'
            ? (outRes.value.data?.total ?? outRes.value.data?.count ?? null)
            : null,
      });

      if (xeroRes.status === 'fulfilled') {
        setXeroStatus(xeroRes.value.data);
      }

      setLoading(false);
    };

    fetchAll();
  }, []);

  const formatCurrency = (cents: number | null) => {
    if (cents === null) return '—';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatCount = (n: number | null) => (n === null ? '—' : String(n));

  const navLinks = [
    { label: 'Classes', to: '/admin/classes' },
    { label: 'Enrolments', to: '/admin/enrolments' },
    { label: 'Configuration', to: '/admin/configuration' },
    { label: 'Reports', to: '/admin/reports' },
    { label: 'Xero Sync', to: '/admin/xero' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      {loading ? (
        <p className="text-gray-500">Loading dashboard...</p>
      ) : (
        <div className="space-y-8">
          {/* Metrics Grid */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Key Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border rounded-lg p-5 shadow-sm">
                <p className="text-sm text-gray-500">Active Enrolments</p>
                <p className="text-3xl font-bold text-indigo-600 mt-1">
                  {formatCount(metrics.activeEnrolments)}
                </p>
              </div>
              <div className="bg-white border rounded-lg p-5 shadow-sm">
                <p className="text-sm text-gray-500">Revenue This Month</p>
                <p className="text-3xl font-bold text-green-600 mt-1">
                  {formatCurrency(metrics.revenueThisMonth)}
                </p>
              </div>
              <div className="bg-white border rounded-lg p-5 shadow-sm">
                <p className="text-sm text-gray-500">Outstanding Invoices</p>
                <p className="text-3xl font-bold text-red-500 mt-1">
                  {formatCount(metrics.outstandingInvoices)}
                </p>
              </div>
            </div>
          </section>

          {/* Xero Sync Status */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Xero Sync Status</h2>
            <div className="bg-white border rounded-lg p-5 shadow-sm">
              {xeroStatus ? (
                <div className="flex flex-wrap gap-6 items-center">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${
                        xeroStatus.connected ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {xeroStatus.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  {xeroStatus.lastSyncAt && (
                    <p className="text-sm text-gray-500">
                      Last sync: {new Date(xeroStatus.lastSyncAt).toLocaleString()}
                    </p>
                  )}
                  {xeroStatus.pendingCount !== undefined && (
                    <p className="text-sm text-gray-500">
                      Pending: <span className="font-medium">{xeroStatus.pendingCount}</span>
                    </p>
                  )}
                  {xeroStatus.errorCount !== undefined && xeroStatus.errorCount > 0 && (
                    <p className="text-sm text-red-600 font-medium">
                      Errors: {xeroStatus.errorCount}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Xero status unavailable.</p>
              )}
            </div>
          </section>

          {/* Navigation */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Admin Sections</h2>
            <div className="flex flex-wrap gap-3">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
