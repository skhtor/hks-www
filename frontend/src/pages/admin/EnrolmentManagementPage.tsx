import React, { useEffect, useState } from 'react';
import { enrolments, classes } from '../../api';
import client from '../../api/client';

interface Dancer {
  id: string;
  firstName: string;
  lastName: string;
}

interface ClassItem {
  id: string;
  name: string;
  style: string;
  dayOfWeek: string;
  startTime: string;
}

interface Enrolment {
  id: string;
  status: 'ACTIVE' | 'CANCELLED' | 'TRIAL';
  startDate: string;
  createdAt: string;
  dancer?: Dancer;
  class?: ClassItem;
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  TRIAL: 'bg-yellow-100 text-yellow-800',
};

export default function EnrolmentManagementPage() {
  const [list, setList] = useState<Enrolment[]>([]);
  const [classList, setClassList] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Move modal state
  const [moveTarget, setMoveTarget] = useState<Enrolment | null>(null);
  const [newClassId, setNewClassId] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState<Enrolment | null>(null);
  const [refundAmount, setRefundAmount] = useState<number | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    Promise.all([enrolments.list(), classes.list()])
      .then(([enrolRes, classRes]) => {
        setList(enrolRes.data);
        setClassList(classRes.data);
      })
      .catch(() => setError('Failed to load enrolments'))
      .finally(() => setLoading(false));
  }, []);

  // Move handlers
  const openMove = (enrolment: Enrolment) => {
    setMoveTarget(enrolment);
    setNewClassId('');
    setMoveError('');
  };

  const closeMove = () => {
    setMoveTarget(null);
    setMoveError('');
  };

  const handleMove = async () => {
    if (!moveTarget || !newClassId) return;
    setMoving(true);
    setMoveError('');
    try {
      const res = await client.put(`/enrolments/${moveTarget.id}/move`, { newClassId });
      setList((prev: Enrolment[]) => prev.map((e: Enrolment) => (e.id === moveTarget.id ? res.data : e)));
      closeMove();
    } catch (err: any) {
      setMoveError(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Failed to move enrolment');
    } finally {
      setMoving(false);
    }
  };

  // Cancel handlers
  const openCancel = async (enrolment: Enrolment) => {
    setCancelTarget(enrolment);
    setCancelError('');
    setRefundAmount(null);
    setRefundLoading(true);
    try {
      const res = await client.get('/cancellation-policies/calculate-refund', {
        params: { enrolmentId: enrolment.id },
      });
      setRefundAmount(res.data?.refundAmount ?? res.data?.amount ?? 0);
    } catch {
      setRefundAmount(0);
    } finally {
      setRefundLoading(false);
    }
  };

  const closeCancel = () => {
    setCancelTarget(null);
    setRefundAmount(null);
    setCancelError('');
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError('');
    try {
      await client.post(`/enrolments/${cancelTarget.id}/cancel`, {});
      setList((prev: Enrolment[]) =>
        prev.map((e: Enrolment) => (e.id === cancelTarget.id ? { ...e, status: 'CANCELLED' as const } : e))
      );
      closeCancel();
    } catch (err: any) {
      setCancelError(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Failed to cancel enrolment');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Enrolment Management</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Move Modal */}
      {moveTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Move Enrolment</h2>
            <p className="text-sm text-gray-500 mb-4">
              Moving {moveTarget.dancer?.firstName} {moveTarget.dancer?.lastName} from{' '}
              <span className="font-medium">{moveTarget.class?.name}</span>
            </p>

            {moveError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                {moveError}
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-1">New Class</label>
            <select
              value={newClassId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewClassId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a class</option>
              {classList
                .filter((c: ClassItem) => c.id !== moveTarget.class?.id)
                .map((c: ClassItem) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.dayOfWeek} {c.startTime}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeMove}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMove}
                disabled={!newClassId || moving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {moving ? 'Moving...' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Cancel Enrolment</h2>
            <p className="text-sm text-gray-500 mb-4">
              Cancel enrolment for {cancelTarget.dancer?.firstName} {cancelTarget.dancer?.lastName} in{' '}
              <span className="font-medium">{cancelTarget.class?.name}</span>?
            </p>

            {cancelError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                {cancelError}
              </div>
            )}

            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
              {refundLoading ? (
                <span className="text-gray-500">Calculating refund...</span>
              ) : (
                <span>
                  Refund amount:{' '}
                  <span className="font-semibold text-gray-900">
                    ${(refundAmount ?? 0).toFixed(2)}
                  </span>
                </span>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeCancel}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Keep Enrolment
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling || refundLoading}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enrolments Table */}
      {list.length === 0 ? (
        <p className="text-gray-500">No enrolments found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Dancer</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Start Date</th>
                <th className="px-4 py-3 text-left">Enrolled</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((enrolment: Enrolment) => (
                <tr key={enrolment.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {enrolment.dancer
                      ? `${enrolment.dancer.firstName} ${enrolment.dancer.lastName}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {enrolment.class?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_BADGE[enrolment.status] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {enrolment.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {enrolment.startDate
                      ? new Date(enrolment.startDate).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {enrolment.createdAt
                      ? new Date(enrolment.createdAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {enrolment.status !== 'CANCELLED' && (
                      <div className="flex gap-3">
                        <button
                          onClick={() => openMove(enrolment)}
                          className="text-indigo-600 hover:underline"
                        >
                          Move
                        </button>
                        <button
                          onClick={() => openCancel(enrolment)}
                          className="text-red-600 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
