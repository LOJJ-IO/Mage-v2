'use client';

import { AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { LoadingScreen } from '@/components/screens/LoadingScreen';
import { InitialScreen } from '@/components/screens/InitialScreen';
import { ChatScreen } from '@/components/screens/ChatScreen';
import { ProfileScreen } from '@/components/screens/ProfileScreen';
import { ConnectionScreen } from '@/components/screens/ConnectionScreen';
import { ImageUploadScreen } from '@/components/screens/ImageUploadScreen';
import { DeferredScreen } from '@/components/screens/DeferredScreen';

export function StateRouter() {
  const currentState = useMageStore((state) => state.currentState);

  const renderScreen = () => {
    switch (currentState) {
      case 'S-G-001':
        return <LoadingScreen key="loading" />;
      
      case 'S-G-002':
        return <InitialScreen key="initial" />;
      
      case 'S-G-003':
      case 'S-G-004':
      case 'S-G-005':
      case 'S-G-006':
      case 'S-G-007':
        return <ChatScreen key="chat" />;
      
      case 'S-G-008':
        return <ProfileScreen key="profile" />;
      
      case 'S-G-009':
        return <ConnectionScreen key="connection" />;
      
      case 'S-G-010':
        return (
          <>
            <ChatScreen key="chat-bg" />
            <ImageUploadScreen key="upload" />
          </>
        );
      
      case 'S-G-011':
        return <DeferredScreen key="deferred" />;
      
      default:
        return <LoadingScreen key="loading-fallback" />;
    }
  };

  return (
    <div className="mage-container">
      <AnimatePresence mode="wait">
        {renderScreen()}
      </AnimatePresence>
    </div>
  );
}
