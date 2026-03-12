import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

type Tab = 'pricing' | 'discounts' | 'xero' | 'notifications';
type InputEvent = { target: { name: string; value: string; type: string; checked?: boolean } };

// ---- Pricing Rules ----
interface PricingRule {
  id: string;
  name: string;
  type: string;
  amount: number;
  isActive: boolean;
}

const emptyPricing = { name: '', type: 'per_class', amount: '', isActive: true };

function PricingRulesTab() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPricing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/pricing-rules')
      .then((r) => setRules(r.data))
      .catch(() => setError('Failed to load pricing rules'))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyPricing); setShowForm(true); };
  const openEdit = (r: PricingRule) => {
    setEditingId(r.id);
    setForm({ name: r.name, type: r.type, amount: String(r.amount), isActive: r.isActive });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const handleChange = (e: InputEvent) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? (checked ?? false) : value }));
  };

  const handleSave = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, amount: Number(form.amount) };
    const req = editingId
      ? apiClient.put(`/pricing-rules/${editingId}`, payload)
      : apiClient.post('/pricing-rules', payload);
    req
      .then((res) => {
        if (editingId) {
          setRules((prev) => prev.map((r) => (r.id === editingId ? res.data : r)));
        } else {
          setRules((prev) => [...prev, res.data]);
        }
        closeForm();
      })
      .catch(() => setError('Failed to save pricing rule'))
      .finally(() => setSaving(false));
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this pricing rule?')) return;
    apiClient.delete(`/pricing-rules/${id}`)
      .then(() => setRules((prev) => prev.filter((r) => r.id !== id)))
      .catch(() => setError('Failed to delete pricing rule'));
  };

  if (loading) return <p className="text-gray-500 py-4">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Pricing Rules</h2>
        <button onClick={openCreate} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">Add Rule</button>
      </div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">{editingId ? 'Edit' : 'Add'} Pricing Rule</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input name="name" value={form.name} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select name="type" value={form.type} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="per_class">Per Class</option>
                  <option value="tiered_bundle">Tiered Bundle</option>
                  <option value="term_based">Term Based</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (cents)</label>
                <input name="amount" type="number" min="0" value={form.amount} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex items-center gap-2">
                <input name="isActive" type="checkbox" checked={form.isActive} onChange={handleChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                <label className="text-sm text-gray-700">Active</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-gray-500 text-sm">No pricing rules configured.</p>
      ) : (
        <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Amount</th>
              <th className="px-4 py-3 text-left">Active</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rules.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                <td className="px-4 py-3 text-gray-600">{r.type}</td>
                <td className="px-4 py-3 text-gray-600">${(r.amount / 100).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.isActive ? 'Yes' : 'No'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(r)} className="text-indigo-600 hover:underline">Edit</button>
                    <button onClick={() => handleDelete(r.id)} className="text-red-600 hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---- Discount Rules ----
interface DiscountRule {
  id: string;
  name: string;
  type: string;
  value: number;
  isActive: boolean;
}

const emptyDiscount = { name: '', type: 'percentage', value: '', isActive: true };

function DiscountRulesTab() {
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyDiscount);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/discount-rules')
      .then((r) => setRules(r.data))
      .catch(() => setError('Failed to load discount rules'))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyDiscount); setShowForm(true); };
  const openEdit = (r: DiscountRule) => {
    setEditingId(r.id);
    setForm({ name: r.name, type: r.type, value: String(r.value), isActive: r.isActive });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const handleChange = (e: InputEvent) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? (checked ?? false) : value }));
  };

  const handleSave = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, value: Number(form.value) };
    const req = editingId
      ? apiClient.put(`/discount-rules/${editingId}`, payload)
      : apiClient.post('/discount-rules', payload);
    req
      .then((res) => {
        if (editingId) {
          setRules((prev) => prev.map((r) => (r.id === editingId ? res.data : r)));
        } else {
          setRules((prev) => [...prev, res.data]);
        }
        closeForm();
      })
      .catch(() => setError('Failed to save discount rule'))
      .finally(() => setSaving(false));
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this discount rule?')) return;
    apiClient.delete(`/discount-rules/${id}`)
      .then(() => setRules((prev) => prev.filter((r) => r.id !== id)))
      .catch(() => setError('Failed to delete discount rule'));
  };

  if (loading) return <p className="text-gray-500 py-4">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Discount Rules</h2>
        <button onClick={openCreate} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">Add Rule</button>
      </div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">{editingId ? 'Edit' : 'Add'} Discount Rule</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input name="name" value={form.name} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select name="type" value={form.type} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed Amount</option>
                  <option value="family">Family</option>
                  <option value="concession">Concession</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value (% or cents)</label>
                <input name="value" type="number" min="0" value={form.value} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex items-center gap-2">
                <input name="isActive" type="checkbox" checked={form.isActive} onChange={handleChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                <label className="text-sm text-gray-700">Active</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-gray-500 text-sm">No discount rules configured.</p>
      ) : (
        <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Value</th>
              <th className="px-4 py-3 text-left">Active</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rules.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                <td className="px-4 py-3 text-gray-600">{r.type}</td>
                <td className="px-4 py-3 text-gray-600">{r.value}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.isActive ? 'Yes' : 'No'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(r)} className="text-indigo-600 hover:underline">Edit</button>
                    <button onClick={() => handleDelete(r.id)} className="text-red-600 hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---- Xero Settings ----
interface XeroSettings {
  accountCode: string;
  taxType: string;
  trackingCategory: string;
}

function XeroSettingsTab() {
  const [settings, setSettings] = useState<XeroSettings>({ accountCode: '', taxType: '', trackingCategory: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiClient.get('/xero/settings')
      .then((r) => setSettings(r.data))
      .catch(() => setError('Failed to load Xero settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: { target: { name: string; value: string } }) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    apiClient.put('/xero/settings', settings)
      .then(() => setSaved(true))
      .catch(() => setError('Failed to save Xero settings'))
      .finally(() => setSaving(false));
  };

  const handleTest = () => {
    setTesting(true);
    setTestResult(null);
    apiClient.post('/xero/test-connection')
      .then((res) => setTestResult(res.data?.message ?? 'Connection successful'))
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setTestResult(err?.response?.data?.message ?? 'Connection failed')
      )
      .finally(() => setTesting(false));
  };

  if (loading) return <p className="text-gray-500 py-4">Loading...</p>;

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Xero Settings</h2>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {saved && <p className="text-green-600 text-sm mb-3">Settings saved.</p>}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Account Code</label>
          <input name="accountCode" value={settings.accountCode} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
          <input name="taxType" value={settings.taxType} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Category</label>
          <input name="trackingCategory" value={settings.trackingCategory} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Settings'}</button>
          <button type="button" onClick={handleTest} disabled={testing} className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50">{testing ? 'Testing...' : 'Test Connection'}</button>
        </div>
      </form>
      {testResult && (
        <p className={`mt-3 text-sm ${testResult.toLowerCase().includes('fail') || testResult.toLowerCase().includes('error') ? 'text-red-600' : 'text-green-600'}`}>{testResult}</p>
      )}
    </div>
  );
}

// ---- Notification Templates ----
interface NotificationTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

function NotificationTemplatesTab() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.get('/notification-templates')
      .then((r) => setTemplates(r.data))
      .catch(() => setError('Failed to load notification templates'))
      .finally(() => setLoading(false));
  }, []);

  const openEdit = (t: NotificationTemplate) => {
    setEditingId(t.id);
    setBody(t.body);
    setSaved(false);
  };

  const handleSave = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setSaved(false);
    apiClient.put(`/notification-templates/${editingId}`, { body })
      .then((res) => {
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? res.data : t)));
        setSaved(true);
      })
      .catch(() => setError('Failed to save template'))
      .finally(() => setSaving(false));
  };

  if (loading) return <p className="text-gray-500 py-4">Loading...</p>;

  const editing = templates.find((t) => t.id === editingId);

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Notification Templates</h2>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <div className="flex gap-6">
        <div className="w-64 shrink-0">
          {templates.length === 0 ? (
            <p className="text-gray-500 text-sm">No templates found.</p>
          ) : (
            <ul className="space-y-1">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => openEdit(t)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm ${editingId === t.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {editing && (
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 mb-1">Subject: {editing.subject}</p>
            {saved && <p className="text-green-600 text-sm mb-2">Template saved.</p>}
            <form onSubmit={handleSave} className="space-y-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Template'}</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main Page ----
const TABS: { id: Tab; label: string }[] = [
  { id: 'pricing', label: 'Pricing Rules' },
  { id: 'discounts', label: 'Discount Rules' },
  { id: 'xero', label: 'Xero Settings' },
  { id: 'notifications', label: 'Notification Templates' },
];

export default function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('pricing');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Configuration</h1>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'pricing' && <PricingRulesTab />}
      {activeTab === 'discounts' && <DiscountRulesTab />}
      {activeTab === 'xero' && <XeroSettingsTab />}
      {activeTab === 'notifications' && <NotificationTemplatesTab />}
    </div>
  );
}
