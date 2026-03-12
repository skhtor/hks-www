import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dancers } from '../../api';

interface FormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalNotes: string;
  allergies: string;
  photoConsent: boolean;
}

const empty: FormData = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  medicalNotes: '',
  allergies: '',
  photoConsent: false,
};

export default function DancerFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormData>(empty);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    dancers.get(id!)
      .then((res) => {
        const d = res.data;
        setForm({
          firstName: d.firstName ?? '',
          lastName: d.lastName ?? '',
          dateOfBirth: d.dateOfBirth?.slice(0, 10) ?? '',
          emergencyContactName: d.emergencyContact?.name ?? '',
          emergencyContactPhone: d.emergencyContact?.phone ?? '',
          medicalNotes: d.medicalNotes ?? '',
          allergies: d.allergies ?? '',
          photoConsent: d.photoConsent ?? false,
        });
      })
      .catch(() => setLoadError('Failed to load dancer'));
  }, [id, isEdit]);

  const validate = (): boolean => {
    const e: Partial<FormData> = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    if (!form.dateOfBirth) e.dateOfBirth = 'Date of birth is required';
    if (!form.emergencyContactName.trim()) e.emergencyContactName = 'Emergency contact name is required';
    if (!form.emergencyContactPhone.trim()) e.emergencyContactPhone = 'Emergency contact phone is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      dateOfBirth: form.dateOfBirth,
      emergencyContact: {
        name: form.emergencyContactName,
        phone: form.emergencyContactPhone,
      },
      medicalNotes: form.medicalNotes,
      allergies: form.allergies,
      photoConsent: form.photoConsent,
    };
    try {
      if (isEdit) {
        await dancers.update(id!, payload);
      } else {
        await dancers.create(payload);
      }
      navigate('/dancers');
    } catch {
      setErrors({ firstName: 'Failed to save dancer. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <div className="p-6 text-red-600">{loadError}</div>;

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Dancer' : 'Add Dancer'}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">First Name *</label>
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          />
          {errors.firstName && <p className="text-red-600 text-sm mt-1">{errors.firstName}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Last Name *</label>
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          />
          {errors.lastName && <p className="text-red-600 text-sm mt-1">{errors.lastName}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date of Birth *</label>
          <input
            type="date"
            name="dateOfBirth"
            value={form.dateOfBirth}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          />
          {errors.dateOfBirth && <p className="text-red-600 text-sm mt-1">{errors.dateOfBirth}</p>}
        </div>

        <fieldset className="border rounded p-4">
          <legend className="text-sm font-medium px-1">Emergency Contact *</legend>
          <div className="space-y-3 mt-2">
            <div>
              <label className="block text-sm mb-1">Name</label>
              <input
                name="emergencyContactName"
                value={form.emergencyContactName}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2"
              />
              {errors.emergencyContactName && (
                <p className="text-red-600 text-sm mt-1">{errors.emergencyContactName}</p>
              )}
            </div>
            <div>
              <label className="block text-sm mb-1">Phone</label>
              <input
                name="emergencyContactPhone"
                value={form.emergencyContactPhone}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2"
              />
              {errors.emergencyContactPhone && (
                <p className="text-red-600 text-sm mt-1">{errors.emergencyContactPhone}</p>
              )}
            </div>
          </div>
        </fieldset>

        <div>
          <label className="block text-sm font-medium mb-1">Medical Notes</label>
          <textarea
            name="medicalNotes"
            value={form.medicalNotes}
            onChange={handleChange}
            rows={3}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Allergies</label>
          <textarea
            name="allergies"
            value={form.allergies}
            onChange={handleChange}
            rows={2}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="photoConsent"
            id="photoConsent"
            checked={form.photoConsent}
            onChange={handleChange}
          />
          <label htmlFor="photoConsent" className="text-sm">Photo consent granted</label>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-indigo-600 text-white px-5 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dancers')}
            className="border px-5 py-2 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
