import type { Metadata } from 'next';
import { DashboardKeyGate } from '@/components/dashboard/DashboardKeyGate';

export const metadata: Metadata = {
  title: 'Mage Analytics Dashboard',
  description: 'Pilot metrics and ROI dashboard',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardKeyGate>
      <div className="font-booton">{children}</div>
    </DashboardKeyGate>
  );
}
