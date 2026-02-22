'use client';

import { AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { RecordingProvider } from './providers/RecordingProvider';
import { LoadingScreen } from './screens/LoadingScreen';
import { InitialScreen } from './screens/InitialScreen';
import { ChatScreen } from './screens/ChatScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ConnectionScreen } from './screens/ConnectionScreen';
import { ImageUploadScreen } from './screens/ImageUploadScreen';
import { DeferredScreen } from './screens/DeferredScreen';
import { StateId } from '@/types';

// Map states to their screen components
const STATE_SCREENS: Record<StateId, React.ComponentType> = {
  'S-G-001': LoadingScreen,
  'S-G-002': InitialScreen,
  'S-G-003': ChatScreen,
  'S-G-004': ChatScreen,
  'S-G-005': ChatScreen,
  'S-G-006': ChatScreen,
  'S-G-007': ChatScreen,
  'S-G-008': ProfileScreen,
  'S-G-009': ConnectionScreen,
  'S-G-010': ImageUploadScreen,
  'S-G-011': DeferredScreen,
};

// Stable key for chat states so ChatScreen does not remount on TAP_SEND (S-G-004 → S-G-003),
// preserving isAiTyping and showing the typing indicator after every message
const CHAT_STATES: StateId[] = ['S-G-003', 'S-G-004', 'S-G-005', 'S-G-007'];
function getScreenKey(stateId: StateId): string {
  return CHAT_STATES.includes(stateId) ? 'chat' : stateId;
}

export function StateRenderer() {
  const { currentState } = useMageStore();
  
  const ScreenComponent = STATE_SCREENS[currentState];

  if (!ScreenComponent) {
    console.error(`No screen component for state: ${currentState}`);
    return (
      <div className="mage-container bg-white dark:bg-mage-gray-900">
        <AnimatePresence mode="wait">
          <LoadingScreen key="loading-fallback" />
        </AnimatePresence>
      </div>
    );
  }

  return (
    <RecordingProvider>
      <div className="mage-container bg-white dark:bg-mage-gray-900 relative overflow-x-hidden min-h-screen">
        <AnimatePresence mode="wait" initial={false}>
          <ScreenComponent key={getScreenKey(currentState)} />
        </AnimatePresence>
      </div>
    </RecordingProvider>
  );
}
