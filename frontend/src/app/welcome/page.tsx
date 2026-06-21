'use client';

import { useEffect } from 'react';
import { useAppNavigation } from '@/components/providers/NavigationLoaderProvider';

export default function WelcomeRedirectPage() {
  const { replace } = useAppNavigation();

  useEffect(() => {
    replace(`/onboard${window.location.search}`);
  }, [replace]);

  return null;
}
