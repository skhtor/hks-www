import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';

interface ClassInfo {
  id: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location?: { name: string };
  level?: string;
  style?: string;
  capacity?: number;
  enrolledCount?: number;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

function calcAge(dob?: string): string {
  if (!dob) return '—';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

function normaliseStudents(raw: unknown[]): Student[] {
  return raw.map((item: unknown) => {
    const r = item as Record<string, unknown>;
    // Could be a dancer directly or wrapped in an enrolment { dancer: {...} }
    const d = (r.dancer as Record<string, unknown>) ?? r;
    return {
      id: (d.id as string) ?? (r.id as string) ?? '',
      firstName: (d.firstName as string) ?? '',
      lastName: (d.lastName as string) ?? '',
      dateOfBirth: (d.dateOfBirth as string) ?? undefined,
      emergencyContactName: (d.emergencyContactName as string) ?? undefined,
      emergencyContactPhone: (d.emergencyContactPhone as string) ?? undefined,
    };
  });
}

function exportCSV(classInfo: ClassInfo | null, students: Student[]) {
  const headers = ['First Name', 'Last Name', 'Age', 'Emergency Contact', 'Emergency Phone'];
  const rows = students.map((s) => [
    s.firstName,
    s.lastName,
    calcAge(s.dateOfBirth),
    s.emergencyContactName ?? '',
    s.emergencyContactPhone ?? '',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${classInfo?.name ?? 'class'}-roll.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ClassRollPage() {
  const { id } = useParams<{ id: string }>();
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const [classRes, rollRes] = await Promise.all([
          client.get(`/classes/${id}`),
          client.get(`/classes/${id}/roll`).catch(() =>
            client.get(`/enrolments?classId=${id}`)
          ),
        ]);

        const classData: ClassInfo = classRes.data?.data ?? classRes.data;
        setClassInfo(classData);

        const rawStudents: unknown[] = rollRes.data?.data ?? rollRes.data ?? [];
        setStudents(normaliseStudents(rawStudents));
      } catch (err) {
        setError('Failed to load class roll.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        to="/teacher/dashboard"
        className="inline-flex items-center text-sm text-purple-600 hover:text-purple-800 mb-6"
      >
        ← Back to Dashboard
      </Link>

      {loading && <p className="text-gray-500">Loading class roll...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && classInfo && (
        <>
          {/* Class info header */}
          <div className="bg-white border rounded-lg p-5 mb-6">
            <h1 className="text-xl font-bold text-gray-900 mb-1">{classInfo.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              <span>{classInfo.dayOfWeek} · {classInfo.startTime}–{classInfo.endTime}</span>
              {classInfo.location?.name && <span>{classInfo.location.name}</span>}
              {(classInfo.style || classInfo.level) && (
                <span>{[classInfo.style, classInfo.level].filter(Boolean).join(' · ')}</span>
              )}
              {classInfo.enrolledCount !== undefined && (
                <span>
                  {classInfo.enrolledCount}
                  {classInfo.capacity !== undefined ? `/${classInfo.capacity}` : ''} enrolled
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">
              Enrolled Students ({students.length})
            </h2>
            <button
              onClick={() => exportCSV(classInfo, students)}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700"
            >
              Export CSV
            </button>
          </div>

          {/* Student table */}
          {students.length === 0 ? (
            <p className="text-gray-500 text-sm">No students enrolled in this class.</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Age</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Emergency Contact</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Emergency Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((s: Student) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {s.firstName} {s.lastName}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{calcAge(s.dateOfBirth)}</td>
                      <td className="px-4 py-3 text-gray-600">{s.emergencyContactName ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.emergencyContactPhone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
