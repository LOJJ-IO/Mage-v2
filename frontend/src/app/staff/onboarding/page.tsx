'use client';

import { useEffect } from 'react';
import { useAppNavigation } from '@/components/providers/NavigationLoaderProvider';

export default function StaffOnboardingPage() {
  const { replace } = useAppNavigation();

  useEffect(() => {
    replace('/staff?nav=knowledge');
  }, [replace]);

  return null;
}
