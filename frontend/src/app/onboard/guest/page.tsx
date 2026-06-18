'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { HydrationGate } from '@/components/HydrationGate';
import { apiClient } from '@/lib/api';
import { useMageStore } from '@/store/mageStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'new' | 'returning';
type ViewState = 'tabs' | 'new-form' | 'returning-form';

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

const inputClass =
  'w-full px-4 py-3.5 rounded-uber-full border border-mage-gray-300 dark:border-mage-gray-600 ' +
  'bg-white dark:bg-mage-gray-900 text-mage-black dark:text-white ' +
  'focus:outline-none focus:ring-2 focus:ring-mage-gray-400 disabled:opacity-60 text-sm';

const primaryBtn =
  'block w-full py-3.5 text-center rounded-uber-full border-2 border-mage-black ' +
  'dark:border-white text-mage-black dark:text-white font-medium disabled:opacity-50 text-sm';

const ghostBtn =
  'block w-full py-2 text-center text-sm text-mage-gray-500 dark:text-mage-gray-400';

interface FieldProps {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
}

function Field({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  disabled,
  autoComplete,
}: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-mage-gray-500 dark:text-mage-gray-400 pl-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className={inputClass}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error banner
// ---------------------------------------------------------------------------

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-5 p-4 rounded-uber-xl border border-red-200 bg-red-50 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New guest registration form
// ---------------------------------------------------------------------------

function NewGuestForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !bookingId.trim() || !checkIn || !checkOut) {
      setError('Please fill in all required fields.');
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setError('Check-out must be after check-in.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.registerGuest({
        name,
        email,
        bookingId,
        roomNumber: roomNumber || undefined,
        checkIn,
        checkOut,
      });
      if (!res.success || !res.data) {
        setError(res.error ?? 'Registration failed. Please try again.');
        return;
      }
      if (res.data.verifyUrl) {
        setDebugUrl(res.data.verifyUrl);
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <motion.div
        key="check-email"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 text-center"
      >
        <div className="text-4xl mb-2">✉️</div>
        <h2 className="text-lg font-semibold text-mage-black dark:text-white">Check your email</h2>
        <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400">
          We sent a sign-in link to <strong>{email}</strong>.<br />
          Click it to access your stay.
        </p>
        {debugUrl && (
          <div className="mt-4 p-3 rounded-uber-xl bg-mage-gray-100 dark:bg-mage-gray-800 text-left">
            <p className="text-xs font-medium text-mage-gray-500 mb-1">Dev: magic link</p>
            <a
              href={debugUrl}
              className="text-xs break-all text-blue-600 dark:text-blue-400 underline"
            >
              {debugUrl}
            </a>
          </div>
        )}
        <button type="button" onClick={onBack} className={ghostBtn}>
          Back to start
        </button>
      </motion.div>
    );
  }

  return (
    <motion.form
      key="new-form"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="space-y-3"
    >
      {error && <ErrorBanner message={error} />}
      <Field
        label="Full name"
        id="reg-name"
        value={name}
        onChange={setName}
        placeholder="Jane Doe"
        required
        disabled={submitting}
        autoComplete="name"
      />
      <Field
        label="Email"
        id="reg-email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="jane@example.com"
        required
        disabled={submitting}
        autoComplete="email"
      />
      <Field
        label="Booking / confirmation ID"
        id="reg-booking"
        value={bookingId}
        onChange={setBookingId}
        placeholder="e.g. BK12345"
        required
        disabled={submitting}
        autoComplete="off"
      />
      <Field
        label="Room number (optional)"
        id="reg-room"
        value={roomNumber}
        onChange={setRoomNumber}
        placeholder="e.g. 204"
        disabled={submitting}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Check-in"
          id="reg-checkin"
          type="date"
          value={checkIn}
          onChange={setCheckIn}
          required
          disabled={submitting}
        />
        <Field
          label="Check-out"
          id="reg-checkout"
          type="date"
          value={checkOut}
          onChange={setCheckOut}
          required
          disabled={submitting}
        />
      </div>
      <button type="submit" disabled={submitting} className={`${primaryBtn} mt-1`}>
        {submitting ? 'Sending…' : 'Send sign-in link'}
      </button>
      <button type="button" onClick={onBack} className={ghostBtn}>
        Back
      </button>
    </motion.form>
  );
}

// ---------------------------------------------------------------------------
// Returning guest form
// ---------------------------------------------------------------------------

function ReturningGuestForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { setGuestProfile, context } = useMageStore();
  const [name, setName] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !bookingId.trim()) {
      setError('Please enter your name and booking ID.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.signInGuestByBooking(name, bookingId);
      if (!res.success || !res.data) {
        setError(res.error ?? 'Sign-in failed. Check your name and booking ID.');
        return;
      }
      setGuestProfile(res.data);
      sessionStorage.setItem('mage-guest-id', res.data.id);
      if (context.hasSeenWelcome) {
        useMageStore.setState({ currentState: 'S-G-003' });
      }
      router.push('/');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.form
      key="returning-form"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="space-y-3"
    >
      {error && <ErrorBanner message={error} />}
      <Field
        label="Full name"
        id="ret-name"
        value={name}
        onChange={setName}
        placeholder="Jane Doe"
        required
        disabled={submitting}
        autoComplete="name"
      />
      <Field
        label="Booking / confirmation ID"
        id="ret-booking"
        value={bookingId}
        onChange={setBookingId}
        placeholder="e.g. BK12345"
        required
        disabled={submitting}
        autoComplete="off"
      />
      <button type="submit" disabled={submitting} className={`${primaryBtn} mt-1`}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      <button type="button" onClick={onBack} className={ghostBtn}>
        Back
      </button>
    </motion.form>
  );
}

// ---------------------------------------------------------------------------
// Tab selector (initial screen)
// ---------------------------------------------------------------------------

function TabSelector({
  onSelect,
}: {
  onSelect: (tab: Tab) => void;
}) {
  return (
    <motion.div
      key="tabs"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        onClick={() => onSelect('new')}
        className={primaryBtn}
      >
        New stay — register
      </motion.button>
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.25 }}
        onClick={() => onSelect('returning')}
        className="block w-full py-3.5 text-center rounded-uber-full border border-mage-gray-300 dark:border-mage-gray-600 text-mage-gray-700 dark:text-mage-gray-200 font-medium text-sm"
      >
        Returning guest — sign in
      </motion.button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

function GuestOnboardInner() {
  const [view, setView] = useState<ViewState>('tabs');

  return (
    <main className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col max-w-md mx-auto px-6 py-12 justify-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold text-mage-black dark:text-white mb-2">lojj</h1>
        <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400 mb-10">
          Guest access
        </p>

        <AnimatePresence mode="wait">
          {view === 'tabs' && (
            <TabSelector
              key="tabs"
              onSelect={(tab) => setView(tab === 'new' ? 'new-form' : 'returning-form')}
            />
          )}
          {view === 'new-form' && (
            <NewGuestForm key="new-form" onBack={() => setView('tabs')} />
          )}
          {view === 'returning-form' && (
            <ReturningGuestForm key="returning-form" onBack={() => setView('tabs')} />
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  );
}

export default function GuestOnboardPage() {
  return (
    <HydrationGate>
      <Suspense>
        <GuestOnboardInner />
      </Suspense>
    </HydrationGate>
  );
}
