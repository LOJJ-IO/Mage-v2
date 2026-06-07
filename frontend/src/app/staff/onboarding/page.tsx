'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StaffOnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/staff?nav=knowledge');
  }, [router]);

  return null;
}
