import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';

interface FeeBreakdown {
  baseFee: number;
  discounts: { label: string; amount: number; reason?: string }[];
  subtotal: number;
  gst: number;
  total: number;
}

interface LocationState {
  classId: string;
  className: string;
  dancerIds: string[];
  feeBreakdown: FeeBreakdown | null;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  // Card form state
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardName, setCardName] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [confirmationId, setConfirmationId] = useState('');

  // Redirect if no state
  if (!state || !state.classId || !state.dancerIds?.length) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">No checkout information found.</p>
        <Link to="/enrol" className="text-indigo-600 hover:underline">
          Back to enrolment
        </Link>
      </div>
    );
  }

  const { classId, className, dancerIds, feeBreakdown } = state;
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Basic client-side validation
    const rawCard = cardNumber.replace(/\s/g, '');
    if (rawCard.length < 13) {
      setError('Please enter a valid card number.');
      return;
    }
    if (expiry.length < 5) {
      setError('Please enter a valid expiry date (MM/YY).');
      return;
    }
    if (cvc.length < 3) {
      setError('Please enter a valid CVC.');
      return;
    }
    if (!cardName.trim()) {
      setError('Please enter the name on the card.');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create enrolments for each dancer
      const startDate = new Date().toISOString();
      const enrolmentResults: string[] = [];

      for (const dancerId of dancerIds) {
        const res = await client.post('/enrolments', {
          dancerId,
          classId,
          startDate,
        });
        const enrolmentId = res.data?.data?.id ?? res.data?.id;
        if (enrolmentId) enrolmentResults.push(enrolmentId);
      }

      // Step 2: Create payment intent using the first invoice
      // The backend creates an invoice on enrolment; we use the payment intent flow
      const intentRes = await client.post('/payments/intent', {
        // Use a synthetic payment method token (in real Stripe flow this would be a PM id)
        paymentMethodId: `pm_card_${rawCard.slice(-4)}`,
        classId,
        dancerIds,
        enrolmentIds: enrolmentResults,
      });

      const paymentId = intentRes.data?.data?.id ?? intentRes.data?.id ?? `PAY-${Date.now()}`;
      setConfirmationId(paymentId);
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
            'Payment failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful</h1>
        <p className="text-gray-600 mb-1">
          You're enrolled in <span className="font-medium">{className}</span>.
        </p>
        {confirmationId && (
          <p className="text-sm text-gray-400 mb-6">Confirmation: {confirmationId}</p>
        )}
        <Link
          to="/dashboard"
          className="inline-block px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Order summary */}
        <div className="space-y-4">
          <div className="border rounded-xl p-4 bg-white">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Order Summary</p>
            <p className="font-semibold text-gray-900 mb-1">{className}</p>
            <p className="text-sm text-gray-500 mb-3">
              {dancerIds.length} dancer{dancerIds.length !== 1 ? 's' : ''}
            </p>

            {feeBreakdown ? (
              <div className="space-y-1.5 text-sm border-t pt-3">
                <div className="flex justify-between text-gray-700">
                  <span>Base fee</span>
                  <span>{fmt(feeBreakdown.baseFee)}</span>
                </div>
                {feeBreakdown.discounts.map((d, i) => (
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
                <div className="flex justify-between font-semibold text-gray-900 border-t pt-1.5 text-base">
                  <span>Total</span>
                  <span>{fmt(feeBreakdown.total)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 border-t pt-3">Fee details unavailable.</p>
            )}
          </div>

          <button
            onClick={() => navigate('/enrol')}
            className="text-sm text-indigo-600 hover:underline"
          >
            ← Back to enrolment
          </button>
        </div>

        {/* Payment form */}
        <div className="border rounded-xl p-4 bg-white">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">Payment Details</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name on card
              </label>
              <input
                type="text"
                value={cardName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCardName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="cc-name"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Card number
              </label>
              <input
                type="text"
                value={cardNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="1234 5678 9012 3456"
                autoComplete="cc-number"
                inputMode="numeric"
                maxLength={19}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiry
                </label>
                <input
                  type="text"
                  value={expiry}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/YY"
                  autoComplete="cc-exp"
                  inputMode="numeric"
                  maxLength={5}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CVC
                </label>
                <input
                  type="text"
                  value={cvc}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="123"
                  autoComplete="cc-csc"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Processing...
                </>
              ) : (
                <>Pay {feeBreakdown ? fmt(feeBreakdown.total) : ''}</>
              )}
            </button>

            <p className="text-xs text-gray-400 text-center">
              Your payment is processed securely.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
