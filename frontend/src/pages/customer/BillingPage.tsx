import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';

interface LineItem {
  description: string;
  amount: number;
  type: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: 'DUE' | 'PAID' | 'OVERDUE' | 'FAILED';
  total: number;
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  dueDate: string;
  createdAt: string;
  lineItems: LineItem[];
}

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700',
  DUE: 'bg-yellow-100 text-yellow-700',
  OVERDUE: 'bg-red-100 text-red-700',
  FAILED: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Paid',
  DUE: 'Due',
  OVERDUE: 'Overdue',
  FAILED: 'Failed',
};

export default function BillingPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    client
      .get(`/invoices/customer/${user.id}`)
      .then((res) => {
        const data: Invoice[] = res.data?.data ?? res.data ?? [];
        setInvoices(data);
      })
      .catch(() => setError('Failed to load invoices.'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const totalPaid = invoices
    .filter((inv) => inv.status === 'PAID')
    .reduce((sum, inv) => sum + inv.total, 0);

  const totalOutstanding = invoices
    .filter((inv) => inv.status === 'DUE' || inv.status === 'OVERDUE')
    .reduce((sum, inv) => sum + inv.total, 0);

  const handleDownload = async (invoice: Invoice) => {
    setDownloading(invoice.id);
    try {
      const res = await client.get(`/invoices/${invoice.id}/receipt`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${invoice.invoiceNumber}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(`/api/invoices/${invoice.id}/receipt`, '_blank');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <Link to="/dashboard" className="text-sm text-indigo-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border rounded-xl p-4 bg-white">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalPaid)}</p>
        </div>
        <div className="border rounded-xl p-4 bg-white">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-yellow-600">{fmt(totalOutstanding)}</p>
        </div>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading invoices...</p>}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && invoices.length === 0 && (
        <p className="text-gray-500 text-sm">No invoices found.</p>
      )}

      {invoices.length > 0 && (
        <ul className="space-y-3">
          {invoices.map((inv) => {
            const isExpanded = expandedId === inv.id;
            const lineItems: LineItem[] = Array.isArray(inv.lineItems) ? inv.lineItems : [];
            return (
              <li key={inv.id} className="border rounded-xl bg-white overflow-hidden">
                {/* Invoice row */}
                <div className="px-4 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      Invoice #{inv.invoiceNumber}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(inv.createdAt).toLocaleDateString()} · Due{' '}
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-base font-semibold text-gray-900">
                      {fmt(inv.total)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {STATUS_LABELS[inv.status] ?? inv.status}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                      className="text-sm text-indigo-600 hover:underline"
                    >
                      {isExpanded ? 'Hide' : 'View Receipt'}
                    </button>
                    <button
                      onClick={() => handleDownload(inv)}
                      disabled={downloading === inv.id}
                      className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                      title="Download PDF"
                    >
                      {downloading === inv.id ? '...' : '↓ PDF'}
                    </button>
                  </div>
                </div>

                {/* Expanded receipt detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-4 bg-gray-50">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
                      Receipt Detail
                    </p>
                    {lineItems.length > 0 ? (
                      <ul className="space-y-1.5 text-sm mb-3">
                        {lineItems.map((item, i) => (
                          <li key={i} className="flex justify-between text-gray-700">
                            <span>{item.description}</span>
                            <span
                              className={
                                item.type === 'discount' ? 'text-green-600' : ''
                              }
                            >
                              {item.type === 'discount' ? '−' : ''}
                              {fmt(Math.abs(item.amount))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400 mb-3">No line items available.</p>
                    )}
                    <div className="border-t pt-2 space-y-1 text-sm">
                      <div className="flex justify-between text-gray-500">
                        <span>GST (10%)</span>
                        <span>{fmt(inv.gstAmount)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-900">
                        <span>Total</span>
                        <span>{fmt(inv.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
