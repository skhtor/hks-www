import { useEffect, useState } from 'react';
import { classes as classesApi } from '../api';

interface DanceClass {
  id: string;
  name: string;
  style?: string;
  level?: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  teacher?: { name: string };
  location?: { name: string };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetablePage() {
  const [allClasses, setAllClasses] = useState<DanceClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterStyle, setFilterStyle] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterDay, setFilterDay] = useState('');

  useEffect(() => {
    classesApi.list()
      .then((res) => setAllClasses(res.data?.data ?? res.data ?? []))
      .catch(() => setError('Failed to load classes.'))
      .finally(() => setLoading(false));
  }, []);

  const styles = [...new Set(allClasses.map((c) => c.style).filter(Boolean))] as string[];
  const levels = [...new Set(allClasses.map((c) => c.level).filter(Boolean))] as string[];

  const filtered = allClasses.filter((c) => {
    if (filterStyle && c.style !== filterStyle) return false;
    if (filterLevel && c.level !== filterLevel) return false;
    if (filterDay && c.dayOfWeek !== filterDay) return false;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Class Timetable</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-8">
        <select
          value={filterStyle}
          onChange={(e) => setFilterStyle(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Styles</option>
          {styles.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Levels</option>
          {levels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select
          value={filterDay}
          onChange={(e) => setFilterDay(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Days</option>
          {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {(filterStyle || filterLevel || filterDay) && (
          <button
            onClick={() => { setFilterStyle(''); setFilterLevel(''); setFilterDay(''); }}
            className="text-sm text-purple-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && <p className="text-gray-500">Loading classes...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-gray-500">No classes match your filters.</p>
      )}

      <div className="space-y-3">
        {filtered.map((c) => (
          <div key={c.id} className="bg-white border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900">{c.name}</p>
              <p className="text-sm text-gray-500">
                {[c.style, c.level].filter(Boolean).join(' · ')}
                {c.teacher?.name ? ` · ${c.teacher.name}` : ''}
              </p>
            </div>
            <div className="text-sm text-gray-600 text-right">
              {c.dayOfWeek && <span className="font-medium">{c.dayOfWeek}</span>}
              {c.startTime && c.endTime && <span> {c.startTime}–{c.endTime}</span>}
              {c.location?.name && <p className="text-gray-400">{c.location.name}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
