import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { classes as classesApi, dancers, fees } from '../../api';
import client from '../../api/client';

interface DanceClass {
  id: string;
  name: string;
  style?: string;
  level?: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  capacity?: number;
  enrolledCount?: number;
  teacher?: { name: string };
  location?: { id: string; name: string };
}

interface Dancer {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
}

interface FeeBreakdown {
  baseFee: number;
  discounts: { label: string; amount: number; reason?: string }[];
  subtotal: number;
  gst: number;
  total: number;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function EnrolmentPage() {
  const navigate = useNavigate();

  // Data
  const [allClasses, setAllClasses] = useState<DanceClass[]>([]);
  const [dancerList, setDancerList] = useState<Dancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterStyle, setFilterStyle] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  // Selection
  const [selectedClass, setSelectedClass] = useState<DanceClass | null>(null);
  const [selectedDancerIds, setSelectedDancerIds] = useState<string[]>([]);

  // Fee breakdown
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  useEffect(() => {
    Promise.all([classesApi.list(), dancers.list()])
      .then(([classRes, dancerRes]) => {
        setAllClasses(classRes.data?.data ?? classRes.data ?? []);
        setDancerList(dancerRes.data?.data ?? dancerRes.data ?? []);
      })
      .catch(() => setError('Failed to load data. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  // Fetch fee breakdown when class + dancers are selected
  useEffect(() => {
    if (!selectedClass || selectedDancerIds.length === 0) {
      setFeeBreakdown(null);
      return;
    }
    setFeeLoading(true);
    client
      .get('/fees/calculate', {
        params: { classId: selectedClass.id, dancerIds: selectedDancerIds.join(',') },
      })
      .then((res) => setFeeBreakdown(res.data))
      .catch(() => {
        // Fallback: build a simple breakdown from fee list
        fees
          .list()
          .then((fRes) => {
            const feeData = fRes.data?.data ?? fRes.data ?? [];
            const baseFee = feeData[0]?.amount ?? 0;
            setFeeBreakdown({
              baseFee: baseFee * selectedDancerIds.length,
              discounts: [],
              subtotal: baseFee * selectedDancerIds.length,
              gst: Math.round(baseFee * selectedDancerIds.length * 0.1),
              total: Math.round(baseFee * selectedDancerIds.length * 1.1),
            });
          })
          .catch(() => setFeeBreakdown(null));
      })
      .finally(() => setFeeLoading(false));
  }, [selectedClass, selectedDancerIds]);

  const styles = [...new Set(allClasses.map((c) => c.style).filter((s): s is string => Boolean(s)))];
  const levels = [...new Set(allClasses.map((c) => c.level).filter((l): l is string => Boolean(l)))];
  const locationNames = [...new Set(allClasses.map((c) => c.location?.name).filter((n): n is string => Boolean(n)))];

  const filtered = allClasses.filter((c: DanceClass) => {
    if (filterStyle && c.style !== filterStyle) return false;
    if (filterLevel && c.level !== filterLevel) return false;
    if (filterDay && c.dayOfWeek !== filterDay) return false;
    if (filterLocation && c.location?.name !== filterLocation) return false;
    return true;
  });

  const toggleDancer = (id: string) => {
    setSelectedDancerIds((prev: string[]) =>
      prev.includes(id) ? prev.filter((d: string) => d !== id) : [...prev, id]
    );
  };

  const handleSelectClass = (cls: DanceClass) => {
    setSelectedClass(cls);
    setSelectedDancerIds([]);
    setFeeBreakdown(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProceed = () => {
    if (!selectedClass || selectedDancerIds.length === 0) return;
    navigate('/checkout', {
      state: {
        classId: selectedClass.id,
        className: selectedClass.name,
        dancerIds: selectedDancerIds,
        feeBreakdown,
      },
    });
  };

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const isFull = (cls: DanceClass) =>
    cls.capacity != null && cls.enrolledCount != null && cls.enrolledCount >= cls.capacity;

  if (loading) return <div className="p-6 text-gray-500">Loading classes...</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Enrol in a Class</h1>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: class list */}
        <div className="lg:col-span-2">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <select
              value={filterStyle}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStyle(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Styles</option>
              {styles.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterLevel}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterLevel(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Levels</option>
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select
              value={filterDay}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterDay(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Days</option>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {locationNames.length > 0 && (
              <select
                value={filterLocation}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterLocation(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All Locations</option>
                {locationNames.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
            {(filterStyle || filterLevel || filterDay || filterLocation) && (
              <button
                onClick={() => { setFilterStyle(''); setFilterLevel(''); setFilterDay(''); setFilterLocation(''); }}
                className="text-sm text-indigo-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="text-gray-500 text-sm">No classes match your filters.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((cls: DanceClass) => {
                const full = isFull(cls);
                const selected = selectedClass?.id === cls.id;
                return (
                  <button
                    key={cls.id}
                    onClick={() => !full && handleSelectClass(cls)}
                    disabled={full}
                    className={`w-full text-left border rounded-xl p-4 transition-colors ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50'
                        : full
                        ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                        : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{cls.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {[cls.style, cls.level].filter(Boolean).join(' · ')}
                          {cls.teacher?.name ? ` · ${cls.teacher.name}` : ''}
                        </p>
                      </div>
                      <div className="text-right text-sm shrink-0">
                        {cls.dayOfWeek && <p className="font-medium text-gray-700">{cls.dayOfWeek}</p>}
                        {cls.startTime && cls.endTime && (
                          <p className="text-gray-500">{cls.startTime}–{cls.endTime}</p>
                        )}
                        {cls.location?.name && (
                          <p className="text-gray-400 text-xs">{cls.location.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {full ? (
                        <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Full</span>
                      ) : cls.capacity != null && cls.enrolledCount != null ? (
                        <span className="text-xs text-gray-400">
                          {cls.capacity - cls.enrolledCount} spot{cls.capacity - cls.enrolledCount !== 1 ? 's' : ''} left
                        </span>
                      ) : null}
                      {selected && (
                        <span className="text-xs font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">Selected</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: enrolment panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">
            {!selectedClass ? (
              <div className="border rounded-xl p-5 bg-gray-50 text-center text-sm text-gray-500">
                Select a class to continue
              </div>
            ) : (
              <>
                {/* Selected class summary */}
                <div className="border rounded-xl p-4 bg-white">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Selected Class</p>
                  <p className="font-semibold text-gray-900">{selectedClass.name}</p>
                  {selectedClass.dayOfWeek && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {selectedClass.dayOfWeek}
                      {selectedClass.startTime && selectedClass.endTime
                        ? ` · ${selectedClass.startTime}–${selectedClass.endTime}`
                        : ''}
                    </p>
                  )}
                  {selectedClass.location?.name && (
                    <p className="text-xs text-gray-400 mt-0.5">{selectedClass.location.name}</p>
                  )}
                </div>

                {/* Dancer selection */}
                <div className="border rounded-xl p-4 bg-white">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Select Dancer(s)</p>
                  {dancerList.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No dancer profiles found.{' '}
                      <a href="/dancers/new" className="text-indigo-600 hover:underline">Add one</a>.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {dancerList.map((dancer: Dancer) => {
                        const checked = selectedDancerIds.includes(dancer.id);
                        return (
                          <label
                            key={dancer.id}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                              checked ? 'bg-indigo-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDancer(dancer.id)}
                              className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                            />
                            <span className="text-sm font-medium text-gray-800">
                              {dancer.firstName} {dancer.lastName}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Fee breakdown */}
                {selectedDancerIds.length > 0 && (
                  <div className="border rounded-xl p-4 bg-white">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Fee Breakdown</p>
                    {feeLoading ? (
                      <p className="text-sm text-gray-400">Calculating fees...</p>
                    ) : feeBreakdown ? (
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between text-gray-700">
                          <span>Base fee ({selectedDancerIds.length} dancer{selectedDancerIds.length > 1 ? 's' : ''})</span>
                          <span>{fmt(feeBreakdown.baseFee)}</span>
                        </div>
                        {feeBreakdown.discounts.map((d: { label: string; amount: number; reason?: string }, i: number) => (
                          <div key={i} className="flex justify-between text-green-700">
                            <span>
                              {d.label}
                              {d.reason && (
                                <span className="ml-1 text-xs text-gray-400">({d.reason})</span>
                              )}
                            </span>
                            <span>−{fmt(d.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-gray-600 border-t pt-1.5">
                          <span>Subtotal</span>
                          <span>{fmt(feeBreakdown.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-500 text-xs">
                          <span>GST (10%)</span>
                          <span>{fmt(feeBreakdown.gst)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-gray-900 border-t pt-1.5">
                          <span>Total</span>
                          <span>{fmt(feeBreakdown.total)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Fee information unavailable.</p>
                    )}
                  </div>
                )}

                {/* Proceed button */}
                <button
                  onClick={handleProceed}
                  disabled={selectedDancerIds.length === 0}
                  className="w-full py-3 px-4 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Proceed to Checkout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
