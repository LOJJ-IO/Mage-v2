'use client';

import { useEffect, useState } from 'react';
import { StaffStateRenderer } from '@/components/staff/StaffStateRenderer';
import { useAppNavigation } from '@/components/providers/NavigationLoaderProvider';
import { useNavigationReady } from '@/hooks/useNavigationReady';
import { hasStoredStaffKey } from '@/lib/onboarding';

export default function StaffPage() {
  const { replace } = useAppNavigation();
  const [ready, setReady] = useState(false);

  useNavigationReady(ready, '/staff');

  useEffect(() => {
    if (hasStoredStaffKey()) {
      setReady(true);
    } else {
      replace('/onboard/staff');
    }
  }, [replace]);

  if (!ready) return null;

  return (
    <main className="h-screen overflow-hidden">
      <StaffStateRenderer />
    </main>
  );
}
