import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { enrolments as enrolmentsApi, invoices as invoicesApi } from '../../api';

interface Enrolment {
  id: string;
  status: string;
  class: {
    id: string;
    name: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  };
  dancer?: { name: string };
}

interface Invoice {
  id: string;
  amount: number;
  status: string;
  dueDate: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [invoiceList, setInvoiceList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      enrolmentsApi.list(),
      invoicesApi.list(),
    ])
      .then(([enrolRes, invRes]) => {
        const all: Enrolment[] = enrolRes.data?.data ?? enrolRes.data ?? [];
        setEnrolments(all.filter((e) => e.status === 'ACTIVE'));
        const inv: Invoice[] = invRes.data?.data ?? invRes.data ?? [];
        setInvoiceList(inv.slice(0, 5));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayIdx = new Date().getDay();

  // Sort enrolments by next upcoming day
  const nextClasses = [...enrolments].sort((a, b) => {
    const dayA = days.indexOf(a.class?.dayOfWeek ?? '');
    const dayB = days.indexOf(b.class?.dayOfWeek ?? '');
    const diffA = (dayA - todayIdx + 7) % 7;
    const diffB = (dayB - todayIdx + 7) % 7;
    return diffA - diffB;
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'PAID': return 'text-green-600';
      case 'OVERDUE': return 'text-red-600';
      default: return 'text-yellow-600';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Welcome back, {user?.name ?? 'there'}!
      </h1>

      {loading ? (
        <p className="text-gray-500">Loading your dashboard...</p>
      ) : (
        <div className="space-y-8">
          {/* Active Enrolments */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Active Enrolments</h2>
            {enrolments.length === 0 ? (
              <p className="text-gray-500 text-sm">No active enrolments.</p>
            ) : (
              <ul className="divide-y divide-gray-200 border rounded-lg overflow-hidden">
                {enrolments.map((e) => (
                  <li key={e.id} className="px-4 py-3 bg-white flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{e.class?.name}</p>
                      {e.dancer && <p className="text-sm text-gray-500">{e.dancer.name}</p>}
                    </div>
                    <span className="text-sm text-gray-500">
                      {e.class?.dayOfWeek} {e.class?.startTime}–{e.class?.endTime}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Next Upcoming Classes */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Next Classes</h2>
            {nextClasses.length === 0 ? (
              <p className="text-gray-500 text-sm">No upcoming classes.</p>
            ) : (
              <ul className="divide-y divide-gray-200 border rounded-lg overflow-hidden">
                {nextClasses.slice(0, 3).map((e) => {
                  const dayIdx = days.indexOf(e.class?.dayOfWeek ?? '');
                  const daysUntil = (dayIdx - todayIdx + 7) % 7;
                  const label = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`;
                  return (
                    <li key={e.id} className="px-4 py-3 bg-white flex justify-between items-center">
                      <p className="font-medium text-gray-900">{e.class?.name}</p>
                      <span className="text-sm text-indigo-600 font-medium">{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Recent Invoices */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Recent Invoices</h2>
            {invoiceList.length === 0 ? (
              <p className="text-gray-500 text-sm">No invoices found.</p>
            ) : (
              <ul className="divide-y divide-gray-200 border rounded-lg overflow-hidden">
                {invoiceList.map((inv) => (
                  <li key={inv.id} className="px-4 py-3 bg-white flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">${(inv.amount / 100).toFixed(2)}</p>
                      <p className="text-sm text-gray-500">Due {new Date(inv.dueDate).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-sm font-semibold ${statusColor(inv.status)}`}>
                      {inv.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Quick Actions */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Quick Actions</h2>
            <div className="flex gap-3">
              <Link
                to="/timetable"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
              >
                Enrol in a Class
              </Link>
              <Link
                to="/billing"
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
              >
                View Billing
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
