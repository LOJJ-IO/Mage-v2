'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StaffStateRenderer } from '@/components/staff/StaffStateRenderer';
import { hasStoredStaffKey } from '@/lib/onboarding';

export default function StaffPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (hasStoredStaffKey()) {
      setReady(true);
    } else {
      router.replace('/onboard/staff');
    }
  }, [router]);

  if (!ready) return null;

  return (
    <main className="h-screen overflow-hidden">
      <StaffStateRenderer />
    </main>
  );
}
