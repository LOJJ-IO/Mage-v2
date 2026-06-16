'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function BlurFade({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={cn('animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both', className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
