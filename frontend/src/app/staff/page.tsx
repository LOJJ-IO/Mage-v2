'use client';

import { StaffStateRenderer } from '@/components/staff/StaffStateRenderer';

export default function StaffPage() {
  return (
    <main className="min-h-screen bg-mage-gray-50 dark:bg-mage-gray-900 md:bg-mage-gray-800">
      <StaffStateRenderer />
    </main>
  );
}
