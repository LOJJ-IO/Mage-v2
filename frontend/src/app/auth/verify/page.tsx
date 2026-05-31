import { Suspense } from 'react';
import AuthVerifyClient from './AuthVerifyClient';

export default function AuthVerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-6">
          <p className="text-mage-gray-500 text-sm">Signing you in…</p>
        </main>
      }
    >
      <AuthVerifyClient />
    </Suspense>
  );
}
