import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

type Tab = 'enrolments' | 'capacity' | 'revenue' | 'outstanding';

// --- Types ---
interface EnrolmentReport {
  classId: string;
  className: string;
  style?: string;
  level?: string;
  activeCount: number;
  newThisMonth?: number;
}

interface CapacityReport {
  classId: string;
  className: string;
  style?: string;
  capacity: number;
  enrolled: number;
  utilization: number;
}

interface RevenueReport {
  month: string;
  total: number;
  count: number;
}

interface OutstandingReport {
  invoiceId: string;
  invoiceNumber?: string;
  customerName: string;
  email?: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
}

// --- CSV helpers ---
function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Tab button ---
function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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

// --- Enrolments Tab ---
function EnrolmentsTab() {
  const [data, setData] = useState<EnrolmentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await apiClient.get('/reports/enrolments', { params });
      const raw = res.data;
      // Normalise various response shapes
      const items: EnrolmentReport[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.enrolments)
            ? raw.enrolments
            : [];
      setData(items);
    } catch {
      setError('Failed to load enrolment report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const exportCsv = () => {
    const headers = ['Class', 'Style', 'Level', 'Active Enrolments', 'New This Month'];
    const rows = data.map((r) => [
      r.className ?? r.classId,
      r.style ?? '',
      r.level ?? '',
      r.activeCount ?? 0,
      r.newThisMonth ?? '',
    ]);
    downloadCsv('enrolments-report.csv', toCsv(headers, rows));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
        >
          Apply
        </button>
        <button
          onClick={exportCsv}
          disabled={data.length === 0}
          className="ml-auto px-4 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-gray-500 text-sm">No data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Style</th>
                <th className="px-4 py-3 text-left">Level</th>
                <th className="px-4 py-3 text-right">Active</th>
                <th className="px-4 py-3 text-right">New This Month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r, i) => (
                <tr key={r.classId ?? i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.className ?? r.classId}</td>
                  <td className="px-4 py-3 text-gray-600">{r.style ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.level ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{r.activeCount ?? 0}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.newThisMonth ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Capacity Tab ---
function CapacityTab() {
  const [data, setData] = useState<CapacityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient
      .get('/reports/capacity')
      .then((res) => {
        const raw = res.data;
        const items: CapacityReport[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw?.classes)
              ? raw.classes
              : [];
        setData(items);
      })
      .catch(() => setError('Failed to load capacity report.'))
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    const headers = ['Class', 'Style', 'Capacity', 'Enrolled', 'Utilization %'];
    const rows = data.map((r) => [
      r.className ?? r.classId,
      r.style ?? '',
      r.capacity,
      r.enrolled,
      r.utilization != null ? r.utilization.toFixed(1) : '',
    ]);
    downloadCsv('capacity-report.csv', toCsv(headers, rows));
  };

  const utilizationColor = (pct: number) => {
    if (pct >= 90) return 'text-red-600 font-semibold';
    if (pct >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={exportCsv}
          disabled={data.length === 0}
          className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-gray-500 text-sm">No data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Style</th>
                <th className="px-4 py-3 text-right">Capacity</th>
                <th className="px-4 py-3 text-right">Enrolled</th>
                <th className="px-4 py-3 text-right">Utilization</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r, i) => {
                const pct = r.utilization ?? (r.capacity > 0 ? (r.enrolled / r.capacity) * 100 : 0);
                return (
                  <tr key={r.classId ?? i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.className ?? r.classId}</td>
                    <td className="px-4 py-3 text-gray-600">{r.style ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{r.capacity}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{r.enrolled}</td>
                    <td className={`px-4 py-3 text-right ${utilizationColor(pct)}`}>
                      {pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">
                      {r.enrolled >= r.capacity ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          Full
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Available
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Revenue Tab ---
function RevenueTab() {
  const [data, setData] = useState<RevenueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (month) params.month = month;
      const res = await apiClient.get('/reports/revenue', { params });
      const raw = res.data;
      const items: RevenueReport[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.revenue)
            ? raw.revenue
            : [];
      setData(items);
    } catch {
      setError('Failed to load revenue report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const exportCsv = () => {
    const headers = ['Month', 'Payments', 'Total (AUD)'];
    const rows = data.map((r) => [r.month, r.count ?? '', (r.total / 100).toFixed(2)]);
    downloadCsv('revenue-report.csv', toCsv(headers, rows));
  };

  const totalRevenue = data.reduce((sum, r) => sum + (r.total ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Month (YYYY-MM)</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
        >
          Apply
        </button>
        <button
          onClick={exportCsv}
          disabled={data.length === 0}
          className="ml-auto px-4 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-gray-500 text-sm">No data available.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Month</th>
                  <th className="px-4 py-3 text-right">Payments</th>
                  <th className="px-4 py-3 text-right">Total (AUD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((r, i) => (
                  <tr key={r.month ?? i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.month}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.count ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      ${(r.total / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-sm">
                <tr>
                  <td className="px-4 py-3 text-gray-700">Total</td>
                  <td></td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    ${(totalRevenue / 100).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// --- Outstanding Payments Tab ---
function OutstandingTab() {
  const [data, setData] = useState<OutstandingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient
      .get('/reports/outstanding')
      .then((res) => {
        const raw = res.data;
        const items: OutstandingReport[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw?.invoices)
              ? raw.invoices
              : [];
        setData(items);
      })
      .catch(() => setError('Failed to load outstanding payments report.'))
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    const headers = ['Invoice', 'Customer', 'Email', 'Amount (AUD)', 'Due Date', 'Days Overdue'];
    const rows = data.map((r) => [
      r.invoiceNumber ?? r.invoiceId,
      r.customerName,
      r.email ?? '',
      (r.amount / 100).toFixed(2),
      r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '',
      r.daysOverdue ?? '',
    ]);
    downloadCsv('outstanding-payments.csv', toCsv(headers, rows));
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={exportCsv}
          disabled={data.length === 0}
          className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-gray-500 text-sm">No outstanding invoices.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Due Date</th>
                <th className="px-4 py-3 text-right">Days Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r, i) => (
                <tr key={r.invoiceId ?? i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.invoiceNumber ?? r.invoiceId}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{r.customerName}</td>
                  <td className="px-4 py-3 text-gray-600">{r.email ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    ${(r.amount / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-medium ${
                        (r.daysOverdue ?? 0) > 30 ? 'text-red-600' : 'text-yellow-600'
                      }`}
                    >
                      {r.daysOverdue ?? '—'}
                    </span>
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

// --- Main Page ---
const TABS: { id: Tab; label: string }[] = [
  { id: 'enrolments', label: 'Enrolments' },
  { id: 'capacity', label: 'Capacity' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'outstanding', label: 'Outstanding Payments' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('enrolments');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports</h1>

      {/* Tab navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1" aria-label="Report tabs">
          {TABS.map((tab) => (
            <TabButton
              key={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'enrolments' && <EnrolmentsTab />}
      {activeTab === 'capacity' && <CapacityTab />}
      {activeTab === 'revenue' && <RevenueTab />}
      {activeTab === 'outstanding' && <OutstandingTab />}
    </div>
  );
}
