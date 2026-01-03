'use client';

import { useEffect } from 'react';
import { StateRenderer } from '@/components/StateRenderer';
import { useMageStore } from '@/store/mageStore';
import { useAgentAvailability } from '@/hooks/useApi';

export default function Home() {
  const { setGuestProfile, context, setContext } = useMageStore();

  // Poll for agent availability
  useAgentAvailability();

  // Initialize mock guest profile on mount
  useEffect(() => {
    // Set mock guest profile for demo
    setGuestProfile({
      id: 'guest-001',
      name: 'Alex Johnson',
      roomNumber: '412',
      checkIn: new Date('2026-01-01'),
      checkOut: new Date('2026-01-05'),
      bookingId: 'BK-2026-0412',
      email: 'alex.johnson@email.com',
      phone: '+1 555-0123',
    });

    // If returning user, start at idle state
    if (context.hasSeenWelcome) {
      useMageStore.setState({ currentState: 'S-G-003' });
    }
  }, [setGuestProfile, context.hasSeenWelcome]);

  return (
    <main className="min-h-screen bg-mage-gray-50">
      <StateRenderer />
    </main>
  );
}
