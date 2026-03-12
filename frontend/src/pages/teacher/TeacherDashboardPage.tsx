import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';

interface TeacherClass {
  id: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location?: { name: string };
  level?: string;
  style?: string;
  enrolledCount?: number;
  capacity?: number;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getCurrentWeekDays(): string[] {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return DAYS[d.getDay()];
  });
}

export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        // Try teacher-specific endpoint first, fall back to filtered classes
        let res;
        try {
          res = await client.get('/teacher/classes');
        } catch {
          res = await client.get(`/classes?teacherId=${user?.id}`);
        }
        const data: TeacherClass[] = res.data?.data ?? res.data ?? [];
        setClasses(data);
      } catch (err) {
        setError('Failed to load classes.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchClasses();
  }, [user?.id]);

  const weekDays = getCurrentWeekDays();
  // Filter to classes that fall within the current week's days
  const weekClasses = classes.filter((c) => weekDays.includes(c.dayOfWeek));

  // Group by day for display
  const byDay = DAYS.reduce<Record<string, TeacherClass[]>>((acc, day) => {
    const dayClasses = weekClasses.filter((c) => c.dayOfWeek === day);
    if (dayClasses.length > 0) acc[day] = dayClasses;
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Welcome, {user?.name ?? 'Teacher'}!
      </h1>
      <p className="text-gray-500 text-sm mb-8">Your classes for this week</p>

      {loading && <p className="text-gray-500">Loading your classes...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && weekClasses.length === 0 && (
        <p className="text-gray-500 text-sm">No classes scheduled for this week.</p>
      )}

      {!loading && !error && Object.keys(byDay).length > 0 && (
        <div className="space-y-6">
          {DAYS.filter((d) => byDay[d]).map((day) => (
            <section key={day}>
              <h2 className="text-base font-semibold text-purple-700 mb-2">{day}</h2>
              <ul className="divide-y divide-gray-200 border rounded-lg overflow-hidden">
                {byDay[day].map((cls) => (
                  <li key={cls.id} className="px-4 py-4 bg-white flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{cls.name}</p>
                      <p className="text-sm text-gray-500">
                        {cls.startTime}–{cls.endTime}
                        {cls.location?.name && ` · ${cls.location.name}`}
                      </p>
                      {(cls.level || cls.style) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[cls.style, cls.level].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {cls.enrolledCount !== undefined && (
                        <span className="text-sm text-gray-500">
                          {cls.enrolledCount}
                          {cls.capacity !== undefined ? `/${cls.capacity}` : ''} enrolled
                        </span>
                      )}
                      <Link
                        to={`/teacher/classes/${cls.id}/roll`}
                        className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 whitespace-nowrap"
                      >
                        View Roll
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
