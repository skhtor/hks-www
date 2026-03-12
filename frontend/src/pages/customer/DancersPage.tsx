import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dancers } from '../../api';

interface Dancer {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

export default function DancersPage() {
  const [dancerList, setDancerList] = useState<Dancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    dancers.list()
      .then((res) => setDancerList(res.data))
      .catch(() => setError('Failed to load dancers'))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dancer profile?')) return;
    try {
      await (dancers as any).delete(id);
      setDancerList((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setError('Failed to delete dancer');
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dancer Profiles</h1>
        <Link
          to="/dancers/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Add Dancer
        </Link>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {dancerList.length === 0 ? (
        <p className="text-gray-500">No dancer profiles yet. Add one to get started.</p>
      ) : (
        <ul className="space-y-3">
          {dancerList.map((dancer) => (
            <li key={dancer.id} className="flex justify-between items-center border rounded p-4">
              <div>
                <p className="font-medium">{dancer.firstName} {dancer.lastName}</p>
                <p className="text-sm text-gray-500">DOB: {dancer.dateOfBirth}</p>
              </div>
              <div className="flex gap-3">
                <Link
                  to={`/dancers/${dancer.id}/edit`}
                  className="text-indigo-600 hover:underline text-sm"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(dancer.id)}
                  className="text-red-600 hover:underline text-sm"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
