'use client';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type ScreenTransitionLoaderProps = {
  className?: string;
  title?: string;
  description?: string;
  showCancel?: boolean;
  onCancel?: () => void;
};

export function ScreenTransitionLoader({
  className,
  title = 'Loading',
  description = 'Please wait a moment.',
  showCancel = false,
  onCancel,
}: ScreenTransitionLoaderProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex items-center justify-center bg-white dark:bg-mage-gray-900',
        className
      )}
    >
      <Empty className="w-full border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner className="size-6" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {showCancel && onCancel && (
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="border-mage-gray-200 dark:border-mage-gray-600 bg-white dark:bg-mage-gray-800 text-mage-black dark:text-white hover:bg-mage-gray-50 dark:hover:bg-mage-gray-700"
            >
              Cancel
            </Button>
          </EmptyContent>
        )}
      </Empty>
    </div>
  );
}
