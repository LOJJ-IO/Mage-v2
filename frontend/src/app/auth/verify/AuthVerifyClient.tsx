'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AuthVerifyClient() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;

    const token = searchParams.get('t');
    if (!token) {
      setError('Missing sign-in link.');
      return;
    }

    // Full-page navigation so Set-Cookie is applied reliably (fetch + StrictMode can
    // double-consume one-time tokens or miss cookies through the dev proxy).
    window.location.replace(`/api/auth/verify?t=${encodeURIComponent(token)}`);
  }, [searchParams]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-white dark:bg-mage-gray-900">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-mage-black dark:text-white mb-2">
            Sign-in failed
          </h1>
          <p className="text-mage-gray-500 text-sm mb-6">{error}</p>
          <a href="/" className="text-sm underline text-mage-gray-600">
            Back
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-white dark:bg-mage-gray-900">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-mage-black dark:text-white mb-2">
          Signing you in…
        </h1>
        <p className="text-mage-gray-500 text-sm">Verifying your stay link.</p>
      </div>
    </main>
  );
}
