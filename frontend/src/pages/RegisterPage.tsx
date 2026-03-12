import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../api';

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  mobile: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  mobile?: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>({ name: '', email: '', password: '', confirmPassword: '', mobile: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Invalid email address';
    }
    if (!form.password) {
      errs.password = 'Password is required';
    } else if (form.password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    }
    if (!form.confirmPassword) {
      errs.confirmPassword = 'Please confirm your password';
    } else if (form.password !== form.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }
    if (!form.mobile.trim()) errs.mobile = 'Mobile number is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await auth.register({ name: form.name, email: form.email, password: form.password, mobile: form.mobile });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setApiError(msg || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof FormData, label: string, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {errors[key] && <p className="text-red-500 text-sm mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">Create an Account</h1>
        {success && (
          <div className="bg-green-50 border border-green-300 text-green-700 rounded p-3 mb-4 text-center">
            Registration successful! Redirecting to login...
          </div>
        )}
        {apiError && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded p-3 mb-4">
            {apiError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {field('name', 'Full Name')}
          {field('email', 'Email', 'email')}
          {field('mobile', 'Mobile Number', 'tel')}
          {field('password', 'Password', 'password')}
          {field('confirmPassword', 'Confirm Password', 'password')}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-purple-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
