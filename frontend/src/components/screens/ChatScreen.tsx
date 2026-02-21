'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useSendMessage, useTranscribeAudio } from '@/hooks/useApi';
import { MessageBubble, TypingIndicator } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';
import { RecordingToast } from '@/components/Toast';
import { ConversationContext } from '@/types';

export function ChatScreen() {
  const {
    currentState,
    messages,
    transition,
    context,
    recording,
    addMessage,
    setInputText,
    addToast,
    setRecording,
  } = useMageStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');

  const sendMessageMutation = useSendMessage();
  const transcribeMutation = useTranscribeAudio();

  // Determine current sub-state
  const isIdle = currentState === 'S-G-003';
  const isTyping = currentState === 'S-G-004';
  const isRecording = currentState === 'S-G-005';
  const isLockedRecording = currentState === 'S-G-006';
  const isTranscribing = currentState === 'S-G-007';

  // Swipe gesture for profile navigation
  const { handlers: swipeHandlers } = useSwipeGesture({
    onSwipeLeft: () => {
      // Swipe left (RTL) to go to profile
      if (!isRecording && !isLockedRecording) {
        transition('SWIPE_RTL_OR_PROFILE');
      } else {
        // Show toast that recording is preserved
        addToast({
          type: 'info',
          message: 'Recording paused',
          duration: 2000,
        });
        transition('SWIPE_RTL_OR_PROFILE');
      }
    },
    onSwipeRight: () => {
      // Swipe right (LTR) to go back
      transition('SWIPE_LTR');
    },
    threshold: 80,
    preventScroll: true,
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // Handle transcription when entering transcribing state
  useEffect(() => {
    if (isTranscribing && recording.audioBlob) {
      handleTranscription(recording.audioBlob);
    }
  }, [isTranscribing, recording.audioBlob]);

  // Transcription handler
  const handleTranscription = async (audioBlob: Blob) => {
    try {
      const result = await transcribeMutation.mutateAsync(audioBlob);
      if (result?.text) {
        setInputText(result.text);
        transition('TRANSCRIPTION_SUCCESS');
      } else {
        addToast({
          type: 'error',
          message: 'Could not transcribe audio',
        });
        transition('TRANSCRIPTION_FAIL');
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Transcription failed',
      });
      transition('TRANSCRIPTION_FAIL');
    } finally {
      setRecording({ audioBlob: undefined });
    }
  };

  // Send message handler
  const handleSendMessage = async (text: string, images?: string[]) => {
    if (!text.trim() && (!images || images.length === 0)) return;

    setIsAiTyping(true);
    setStreamingMessage('');

    try {
      await sendMessageMutation.mutateAsync({ content: text, images });
    } catch (error) {
      addToast({
        type: 'error',
        message: 'Failed to send message',
      });
    } finally {
      setIsAiTyping(false);
      setStreamingMessage('');
    }
  };

  // Upload handler
  const handleUpload = () => {
    transition('UPLOAD');
  };

  // Get context indicator text
  const getContextIndicator = (): string | null => {
    switch (context.conversationContext) {
      case 'FRONT_DESK_AGENT':
        return 'Connected to Front Desk';
      default:
        return null;
    }
  };

  const contextIndicator = getContextIndicator();

  // Show Yes/No buttons when last assistant message asks for satisfaction (required by backend)
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const askedSatisfaction =
    lastMessage?.content?.includes('Was that helpful?') ||
    lastMessage?.content?.includes('Do you require any further assistance?') ||
    lastMessage?.content?.includes('(Yes / No)');
  const showSatisfactionButtons =
    !isAiTyping &&
    !streamingMessage &&
    lastMessage?.role === 'assistant' &&
    askedSatisfaction;

  return (
    <div
      className="min-h-screen bg-white flex flex-col"
      {...swipeHandlers}
    >
      {/* Recording toast when navigating away while recording */}
      <RecordingToast
        isVisible={
          currentState === 'S-G-008' &&
          recording.isRecording
        }
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-mage-gray-200 safe-area-top">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-mage-black rounded-xl flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2L2 6v8l8 4 8-4V6l-8-4z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 6l8 4m0 8V10m8-4l-8 4"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-semibold text-mage-black">Mage</h1>
              {contextIndicator && (
                <p className="text-xs text-mage-blue font-medium">
                  {contextIndicator}
                </p>
              )}
            </div>
          </div>

          {/* Profile button */}
          <ProfileButton
            hasNotification={context.agentNotificationPending}
            onClick={() => transition('SWIPE_RTL_OR_PROFILE')}
          />
        </div>
      </header>

      {/* Messages area */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        {/* Empty state */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full flex flex-col items-center justify-center text-center py-12"
          >
            <div className="w-16 h-16 bg-mage-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M28 15.333A12.333 12.333 0 019.4 5.4M4 16.667a12.333 12.333 0 0018.6 9.933"
                  stroke="#CBCBCB"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="16" cy="16" r="3" fill="#CBCBCB" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-mage-black mb-2">
              How can I help?
            </h2>
            <p className="text-mage-gray-500 max-w-xs">
              Ask about your room, hotel amenities, or request any service.
            </p>
          </motion.div>
        )}

        {/* Messages */}
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </AnimatePresence>

        {/* Streaming message */}
        {streamingMessage && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingMessage,
              timestamp: new Date(),
            }}
          />
        )}

        {/* Typing indicator */}
        <AnimatePresence>
          {isAiTyping && !streamingMessage && <TypingIndicator />}
        </AnimatePresence>

        {/* Transcribing indicator */}
        <AnimatePresence>
          {isTranscribing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-center py-4"
            >
              <div className="bg-mage-gray-100 px-4 py-2 rounded-uber-full flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1v2M8 13v2M15 8h-2M3 8H1M13.07 13.07l-1.41-1.41M4.34 4.34L2.93 2.93M13.07 2.93l-1.41 1.41M4.34 11.66l-1.41 1.41"
                      stroke="#757575"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.div>
                <span className="text-sm text-mage-gray-500">
                  Transcribing...
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </main>

      {/* Yes/No quick replies when assistant asked if the answer helped */}
      {showSatisfactionButtons && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-4 py-2 flex gap-2 justify-center border-t border-mage-gray-100 bg-white"
        >
          <button
            type="button"
            onClick={() => handleSendMessage('Yes')}
            className="px-5 py-2.5 rounded-uber-full font-medium bg-mage-black text-white hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => handleSendMessage('No')}
            className="px-5 py-2.5 rounded-uber-full font-medium bg-mage-gray-100 text-mage-black hover:bg-mage-gray-200 active:scale-[0.98] transition-all"
          >
            No
          </button>
        </motion.div>
      )}

      {/* Input area */}
      <ChatInput
        onSend={handleSendMessage}
        onUpload={handleUpload}
        isTypingState={isTyping}
        isRecordingState={isRecording}
        isLockedRecording={isLockedRecording}
      />
    </div>
  );
}

// Profile button with notification dot
interface ProfileButtonProps {
  hasNotification: boolean;
  onClick: () => void;
}

function ProfileButton({ hasNotification, onClick }: ProfileButtonProps) {
  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-full hover:bg-mage-gray-100 transition-colors"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
          stroke="#000"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="7"
          r="4"
          stroke="#000"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      
      {/* Notification dot */}
      {hasNotification && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-1 right-1 w-3 h-3 bg-mage-blue rounded-full border-2 border-white"
        />
      )}
    </button>
  );
}
