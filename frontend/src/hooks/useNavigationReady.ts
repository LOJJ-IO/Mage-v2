'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppNavigationOptional } from '@/components/providers/NavigationLoaderProvider';

/** Call when route content is mounted and ready to be shown. */
export function useNavigationReady(active = true, path?: string) {
  const navigation = useAppNavigationOptional();
  const pathname = usePathname();

  useEffect(() => {
    if (!active || !navigation) return;
    navigation.markNavigationReady(path ?? pathname);
  }, [active, navigation, path, pathname]);
}
