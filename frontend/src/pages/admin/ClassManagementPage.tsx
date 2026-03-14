import { useEffect, useState } from 'react';
import { classes, teachers, locations } from '../../api';

interface ClassItem {
  id: string;
  name: string;
  style: string;
  level: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location?: { id: string; name: string };
  teacher?: { id: string; firstName: string; lastName: string };
  enrolledCount: number;
  capacity: number;
}

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
}

interface Location {
  id: string;
  name: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Open'];

const emptyForm = {
  name: '',
  style: '',
  level: '',
  dayOfWeek: 'Monday',
  startTime: '',
  endTime: '',
  capacity: '',
  teacherId: '',
  locationId: '',
};

export default function ClassManagementPage() {
  const [classList, setClassList] = useState<ClassItem[]>([]);
  const [teacherList, setTeacherList] = useState<Teacher[]>([]);
  const [locationList, setLocationList] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [conflictError, setConflictError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([classes.list(), teachers.list(), locations.list()])
      .then(([classRes, teacherRes, locationRes]) => {
        setClassList(classRes.data ?? []);
        setTeacherList(teacherRes.data ?? []);
        setLocationList(locationRes.data ?? []);
      })
      .catch(() => setError('Failed to load data'))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setConflictError('');
    setShowForm(true);
  };

  const openEdit = (cls: ClassItem) => {
    setEditingId(cls.id);
    setForm({
      name: cls.name,
      style: cls.style,
      level: cls.level,
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      endTime: cls.endTime,
      capacity: String(cls.capacity),
      teacherId: cls.teacher?.id ?? '',
      locationId: cls.location?.id ?? '',
    });
    setConflictError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setConflictError('');
  };

  const handleChange = (e: { target: { name: string; value: string } }) => {
    setForm((prev: typeof emptyForm) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSaving(true);
    setConflictError('');

    // Calculate duration in minutes from startTime and endTime
    const [startH, startM] = form.startTime.split(':').map(Number);
    const [endH, endM] = form.endTime.split(':').map(Number);
    const duration = (endH * 60 + endM) - (startH * 60 + startM);

    if (duration <= 0) {
      setError('End time must be after start time.');
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = {
      ...form,
      dayOfWeek: form.dayOfWeek.toUpperCase(),
      capacity: Number(form.capacity),
      duration,
    };
    // Strip empty optional foreign keys so backend doesn't get empty strings
    if (!payload.teacherId) delete payload.teacherId;
    if (!payload.locationId) delete payload.locationId;
    if (!payload.pricingRuleId) delete payload.pricingRuleId;
    delete payload.endTime;
    try {
      if (editingId) {
        const res = await classes.update(editingId, payload);
        setClassList((prev: ClassItem[]) => prev.map((c: ClassItem) => (c.id === editingId ? res.data : c)));
      } else {
        const res = await classes.create(payload);
        setClassList((prev: ClassItem[]) => [...prev, res.data]);
      }
      closeForm();
    } catch (err: any) {
      const errData = err?.response?.data;
      const details = errData?.error?.details;
      let msg: string;
      if (details && typeof details === 'object') {
        msg = Object.values(details).join(', ');
      } else {
        msg = errData?.error?.message ?? errData?.message ?? '';
      }
      if (
        err?.response?.status === 409 ||
        msg.toLowerCase().includes('conflict') ||
        msg.toLowerCase().includes('scheduling')
      ) {
        setConflictError(msg || 'Scheduling conflict detected. Please choose a different time, room, or teacher.');
      } else {
        setError(msg || 'Failed to save class');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this class? This cannot be undone.')) return;
    try {
      await classes.delete(id);
      setClassList((prev: ClassItem[]) => prev.filter((c: ClassItem) => c.id !== id));
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.response?.data?.error ?? '';
      setError(msg || 'Failed to delete class');
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Class Management</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          Create Class
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Edit Class' : 'Create Class'}
            </h2>

            {conflictError && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md text-sm">
                <strong>Scheduling Conflict:</strong> {conflictError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
                  <input
                    name="style"
                    value={form.style}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Ballet, Hip Hop"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                  <select
                    name="level"
                    value={form.level}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select level</option>
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                  <select
                    name="dayOfWeek"
                    value={form.dayOfWeek}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                  <input
                    name="capacity"
                    type="number"
                    min="1"
                    value={form.capacity}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    name="startTime"
                    type="time"
                    value={form.startTime}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    name="endTime"
                    type="time"
                    value={form.endTime}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                  <select
                    name="teacherId"
                    value={form.teacherId}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Unassigned</option>
                    {teacherList.map((t: Teacher) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <select
                    name="locationId"
                    value={form.locationId}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">No location</option>
                    {locationList.map((l: Location) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Classes Table */}
      {classList.length === 0 ? (
        <p className="text-gray-500">No classes yet. Create one to get started.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Style</th>
                <th className="px-4 py-3 text-left">Level</th>
                <th className="px-4 py-3 text-left">Day / Time</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Teacher</th>
                <th className="px-4 py-3 text-left">Enrolled</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {classList.map((cls: ClassItem) => (
                <tr key={cls.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{cls.name}</td>
                  <td className="px-4 py-3 text-gray-600">{cls.style}</td>
                  <td className="px-4 py-3 text-gray-600">{cls.level}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {cls.dayOfWeek} {cls.startTime}–{cls.endTime}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{cls.location?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {cls.teacher ? `${cls.teacher.firstName} ${cls.teacher.lastName}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span
                      className={
                        cls.enrolledCount >= cls.capacity
                          ? 'text-red-600 font-medium'
                          : 'text-gray-700'
                      }
                    >
                      {cls.enrolledCount}/{cls.capacity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEdit(cls)}
                        className="text-indigo-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(cls.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
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
