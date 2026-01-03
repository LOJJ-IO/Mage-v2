'use client';

import { AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
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

export function StateRenderer() {
  const { currentState } = useMageStore();
  
  const ScreenComponent = STATE_SCREENS[currentState];

  if (!ScreenComponent) {
    console.error(`No screen component for state: ${currentState}`);
    return null;
  }

  return (
    <div className="mage-container bg-white">
      <AnimatePresence mode="wait">
        <ScreenComponent key={currentState} />
      </AnimatePresence>
    </div>
  );
}
