'use client';

import type { ComponentProps } from 'react';
import { useAppNavigationOptional } from '@/components/providers/NavigationLoaderProvider';
import type { NavigationCopy } from '@/lib/navigationLoaderCopy';

type AppNavLinkProps = ComponentProps<'a'> & {
  href: string;
  copy?: Partial<NavigationCopy>;
};

export function AppNavLink({
  href,
  copy,
  onClick,
  children,
  ...props
}: AppNavLinkProps) {
  const navigation = useAppNavigationOptional();

  return (
    <a
      href={href}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (!navigation) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return;
        }
        e.preventDefault();
        navigation.navigate(href, copy);
      }}
    >
      {children}
    </a>
  );
}
