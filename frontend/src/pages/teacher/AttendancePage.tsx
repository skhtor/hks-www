import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
}

interface AttendanceRecord {
  dancerId: string;
  present: boolean;
  notes: string;
}

function normaliseStudents(raw: unknown[]): Student[] {
  return raw.map((item: unknown) => {
    const r = item as Record<string, unknown>;
    const d = (r.dancer as Record<string, unknown>) ?? r;
    return {
      id: (d.id as string) ?? '',
      firstName: (d.firstName as string) ?? '',
      lastName: (d.lastName as string) ?? '',
    };
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { id } = useParams<{ id: string }>();
  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState<string>(todayISO());
  const [records, setRecords] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchStudents = async () => {
      try {
        const res = await client.get(`/classes/${id}/roll`).catch(() =>
          client.get(`/enrolments?classId=${id}`)
        );
        const raw: unknown[] = res.data?.data ?? res.data ?? [];
        const normalised = normaliseStudents(raw);
        setStudents(normalised);
        // Default all to present
        const initial: Record<string, AttendanceRecord> = {};
        normalised.forEach((s) => {
          initial[s.id] = { dancerId: s.id, present: true, notes: '' };
        });
        setRecords(initial);
      } catch {
        setError('Failed to load students.');
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();
  }, [id]);

  function togglePresent(dancerId: string) {
    setRecords((prev: Record<string, AttendanceRecord>) => ({
      ...prev,
      [dancerId]: { ...prev[dancerId], present: !prev[dancerId].present },
    }));
  }

  function updateNotes(dancerId: string, notes: string) {
    setRecords((prev: Record<string, AttendanceRecord>) => ({
      ...prev,
      [dancerId]: { ...prev[dancerId], notes },
    }));
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await client.post('/attendance', {
        classId: id,
        date,
        records: Object.values(records),
      });
      setSuccess('Attendance saved successfully.');
    } catch {
      setError('Failed to save attendance. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to={`/teacher/classes/${id}/roll`}
        className="inline-flex items-center text-sm text-purple-600 hover:text-purple-800 mb-6"
      >
        ← Back to Class Roll
      </Link>

      <h1 className="text-xl font-bold text-gray-900 mb-6">Mark Attendance</h1>

      {/* Date picker */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Session Date</label>
        <input
          type="date"
          value={date}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading students...</p>}

      {!loading && students.length === 0 && (
        <p className="text-gray-500 text-sm">No students enrolled in this class.</p>
      )}

      {!loading && students.length > 0 && (
        <>
          <div className="space-y-3 mb-6">
            {students.map((s: Student) => {
              const rec = records[s.id];
              return (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white border rounded-lg px-4 py-3"
                >
                  <span className="font-medium text-gray-900 sm:w-48 shrink-0">
                    {s.firstName} {s.lastName}
                  </span>

                  {/* Present / Absent toggle */}
                  <button
                    type="button"
                    onClick={() => togglePresent(s.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold w-20 text-center transition-colors ${
                      rec?.present
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {rec?.present ? 'Present' : 'Absent'}
                  </button>

                  {/* Notes */}
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={rec?.notes ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateNotes(s.id, e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              );
            })}
          </div>

          {/* Feedback */}
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {success && <p className="text-green-600 text-sm mb-3">{success}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Attendance'}
          </button>
        </>
      )}
    </div>
  );
}
