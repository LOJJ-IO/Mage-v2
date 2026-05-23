'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useSendMessage, useTranscribeAudio, useConversationHistory, useFaqFeedback } from '@/hooks/useApi';
import { Message } from '@/types';
import { MessageBubble, TypingIndicator } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';
import { RecordingToast } from '@/components/Toast';
import { ConversationContext } from '@/types';

/** Skeleton that matches ChatScreen layout; shown briefly before chat content. */
function ChatScreenSkeleton() {
  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white dark:bg-mage-gray-900">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-white dark:bg-mage-gray-900 border-b border-mage-gray-200 dark:border-mage-gray-700 safe-area-top">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-mage-gray-200 dark:bg-mage-gray-700 rounded-xl animate-pulse" />
            <div className="h-5 w-24 bg-mage-gray-200 dark:bg-mage-gray-700 rounded-lg animate-pulse" />
          </div>
          <div className="w-10 h-10 bg-mage-gray-200 dark:bg-mage-gray-700 rounded-full animate-pulse" />
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden px-4 pt-20 pb-28">
        <div className="space-y-4 py-4">
          <div className="flex justify-start">
            <div className="h-16 w-3/4 max-w-[85%] bg-mage-gray-100 dark:bg-mage-gray-800 rounded-uber-xl rounded-bl-sm animate-pulse" />
          </div>
          <div className="flex justify-end">
            <div className="h-12 w-1/2 max-w-[85%] bg-mage-gray-200 dark:bg-mage-gray-700 rounded-uber-xl rounded-br-sm animate-pulse" />
          </div>
          <div className="flex justify-start">
            <div className="h-20 w-2/3 max-w-[85%] bg-mage-gray-100 dark:bg-mage-gray-800 rounded-uber-xl rounded-bl-sm animate-pulse" />
          </div>
        </div>
      </main>
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-white dark:bg-mage-gray-900 border-t border-mage-gray-200 dark:border-mage-gray-700 shadow-[0_-8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-mage-gray-200 dark:bg-mage-gray-700 animate-pulse" />
          <div className="flex-1 h-12 rounded-uber-xl bg-mage-gray-100 dark:bg-mage-gray-800 animate-pulse" />
          <div className="w-12 h-12 rounded-full bg-mage-gray-200 dark:bg-mage-gray-700 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function ChatScreen() {
  const {
    currentState,
    messages,
    transition,
    context,
    recording,
    addMessage,
    setMessages,
    setInputText,
    addToast,
    setRecording,
    guestProfile,
  } = useMageStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Brief skeleton before chat content
  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), 550);
    return () => clearTimeout(t);
  }, []);

  const sendMessageMutation = useSendMessage();
  const faqFeedbackMutation = useFaqFeedback();
  const transcribeMutation = useTranscribeAudio();
  const { data: historyData, isSuccess: historyLoaded } = useConversationHistory(
    guestProfile?.id
  );
  const historyHydratedRef = useRef(false);

  useEffect(() => {
    historyHydratedRef.current = false;
  }, [guestProfile?.id]);

  useEffect(() => {
    if (
      historyLoaded &&
      historyData &&
      !historyHydratedRef.current &&
      !sendMessageMutation.isPending &&
      !faqFeedbackMutation.isPending
    ) {
      setMessages(historyData);
      historyHydratedRef.current = true;
    }
  }, [
    historyLoaded,
    historyData,
    setMessages,
    sendMessageMutation.isPending,
    faqFeedbackMutation.isPending,
  ]);

  // Determine current sub-state
  const isIdle = currentState === 'S-G-003';
  const isTyping = currentState === 'S-G-004';
  const isRecording = currentState === 'S-G-005';
  const isTranscribing = currentState === 'S-G-007';

  // Swipe gesture for profile navigation
  const { handlers: swipeHandlers } = useSwipeGesture({
    onSwipeLeft: () => {
      // Swipe left (RTL) to go to profile
      if (!isRecording) {
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

  // Scroll to bottom when new messages arrive or when typing indicator appears
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, isAiTyping]);

  // Guard: only start transcription once per blob (avoids double-invoke / Strict Mode)
  const transcriptionStartedForBlobRef = useRef(false);
  const mountedRef = useRef(true);

  // Transcription handler (stable; used in effect)
  const handleTranscription = useCallback(
    async (audioBlob: Blob) => {
      try {
        const result = await transcribeMutation.mutateAsync(audioBlob);
        if (!mountedRef.current) return;

        const text = result?.text?.trim() ?? '';
        const confidence = result?.confidence ?? 0;

        if (text) {
          setInputText(text);
          transition('TRANSCRIPTION_SUCCESS');
        } else {
          // Empty or no speech (common for silence/short clips), not an API error
          addToast({
            type: 'info',
            message:
              confidence < 0.5
                ? 'No speech detected. Try again.'
                : 'Nothing to transcribe.',
            duration: 3000,
          });
          transition('TRANSCRIPTION_FAIL');
        }
      } catch (error) {
        if (!mountedRef.current) return;
        const message =
          error instanceof Error ? error.message : 'Transcription failed';
        addToast({ type: 'error', message, duration: 4000 });
        transition('TRANSCRIPTION_FAIL');
      } finally {
        if (mountedRef.current) {
          setRecording({ audioBlob: undefined });
        }
        transcriptionStartedForBlobRef.current = false;
      }
    },
    [
      transcribeMutation,
      setInputText,
      transition,
      addToast,
      setRecording,
    ]
  );

  // When entering transcribing state, run once per blob (ref prevents double call)
  useEffect(() => {
    if (
      !isTranscribing ||
      !recording.audioBlob ||
      transcriptionStartedForBlobRef.current
    ) {
      return;
    }
    if (recording.audioBlob.size < 1024) {
      addToast({
        type: 'info',
        message: 'Recording too short. Try again.',
        duration: 3000,
      });
      transition('TRANSCRIPTION_FAIL');
      setRecording({ audioBlob: undefined });
      transcriptionStartedForBlobRef.current = false;
      return;
    }
    transcriptionStartedForBlobRef.current = true;
    handleTranscription(recording.audioBlob);
  }, [isTranscribing, recording.audioBlob, handleTranscription, addToast, transition, setRecording]);

  // Ignore transcription completion after unmount or navigate away
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [frontDeskPhone, setFrontDeskPhone] = useState(
    () => process.env.NEXT_PUBLIC_HOTEL_FRONT_DESK_PHONE?.trim() || ''
  );

  useEffect(() => {
    if (frontDeskPhone) return;
    let cancelled = false;
    (async () => {
      const { apiClient } = await import('@/lib/api');
      const res = await apiClient.getPublicConfig();
      if (!cancelled && res.success && res.data?.frontDeskPhone) {
        setFrontDeskPhone(res.data.frontDeskPhone);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frontDeskPhone]);

  // Send message handler
  const handleSendMessage = async (
    text: string,
    images?: string[],
    options?: { skipUserBubble?: boolean }
  ) => {
    if (!text.trim() && (!images || images.length === 0)) return;

    setIsAiTyping(true);
    setStreamingMessage('');

    try {
      const result = await sendMessageMutation.mutateAsync({
        content: text,
        images,
        skipUserBubble: options?.skipUserBubble,
      });
      if (result.continueTask && result.taskMessage?.trim()) {
        await sendMessageMutation.mutateAsync({
          content: result.taskMessage.trim(),
          skipUserBubble: true,
          taskContinuation: true,
        });
      }
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

  const handleContactYes = useCallback(() => {
    if (frontDeskPhone) {
      window.location.href = `tel:${frontDeskPhone.replace(/\s/g, '')}`;
    }
    transition('CONTACT_FRONT_DESK');
  }, [frontDeskPhone, transition]);

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

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const handleFaqHelpful = useCallback(
    (msg: Message) => {
      if (!msg.triggerContent || msg.faqResolved != null) return;
      faqFeedbackMutation.mutate({
        helpful: true,
        triggerContent: msg.triggerContent,
        faqTitles: msg.faqItems?.map((i) => i.title),
        faqMessageId: msg.id,
        faqPanelMessageId: msg.id,
      });
    },
    [faqFeedbackMutation]
  );

  const handleFaqNeedHelp = useCallback(
    (msg: Message) => {
      if (!msg.triggerContent || msg.faqResolved != null) return;
      setIsAiTyping(true);
      faqFeedbackMutation.mutate(
        {
          helpful: false,
          triggerContent: msg.triggerContent,
          faqTitles: msg.faqItems?.map((i) => i.title),
          faqMessageId: msg.id,
          faqPanelMessageId: msg.id,
        },
        {
          onSettled: () => setIsAiTyping(false),
        }
      );
    },
    [faqFeedbackMutation]
  );

  const showContactConfirmation =
    !isAiTyping &&
    !streamingMessage &&
    lastMessage?.role === 'assistant' &&
    lastMessage?.requireContactConfirmation;

  if (showSkeleton) {
    return <ChatScreenSkeleton />;
  }

  return (
    <div
      className="h-screen overflow-hidden flex flex-col bg-white dark:bg-mage-gray-900"
      {...swipeHandlers}
    >
      <RecordingToast
        isVisible={
          currentState === 'S-G-008' &&
          recording.isRecording
        }
      />

      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-white dark:bg-mage-gray-900 border-b border-mage-gray-200 dark:border-mage-gray-700 safe-area-top">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-mage-black dark:bg-mage-gray-600 rounded-xl flex items-center justify-center">
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
              <h1 className="font-semibold text-mage-black dark:text-white">Mage</h1>
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

      {/* Messages area - vertical scroll only; no horizontal scroll */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-20 pb-28">
        {/* Empty state */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full flex flex-col items-center justify-center text-center py-12"
          >
            <div className="w-16 h-16 bg-mage-gray-100 dark:bg-mage-gray-800 rounded-2xl flex items-center justify-center mb-4">
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
            <h2 className="text-lg font-semibold text-mage-black dark:text-white mb-2">
              How can I help?
            </h2>
            <p className="text-mage-gray-500 dark:text-mage-gray-400 max-w-xs">
              Ask about your room, hotel amenities, or request any service.
            </p>
          </motion.div>
        )}

        {/* Messages */}
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onFaqHelpful={handleFaqHelpful}
              onFaqNeedHelp={handleFaqNeedHelp}
              faqFeedbackPending={faqFeedbackMutation.isPending}
            />
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

        {/* Typing indicator — inline with assistant messages */}
        <AnimatePresence>
          {isAiTyping && !streamingMessage && <TypingIndicator />}
        </AnimatePresence>

        {/* Contact Prompt */}
        {showContactConfirmation && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-5 flex flex-col items-center gap-3 border-t border-mage-gray-100 dark:border-mage-gray-700 bg-white dark:bg-mage-gray-900 -mx-4 mt-4"
          >
            <p className="text-sm font-medium text-mage-gray-600 dark:text-mage-gray-300">
              Connect you to the front desk?
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={handleContactYes}
                className="px-5 py-2.5 rounded-uber-full font-medium bg-mage-black dark:bg-mage-gray-100 text-white dark:text-mage-black hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('No, thank you')}
                className="px-5 py-2.5 rounded-uber-full font-medium bg-mage-gray-100 dark:bg-mage-gray-700 text-mage-black dark:text-white hover:bg-mage-gray-200 dark:hover:bg-mage-gray-600 active:scale-[0.98] transition-all"
              >
                No
              </button>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input area - fixed at bottom */}
      <ChatInput
        onSend={handleSendMessage}
        onUpload={handleUpload}
        isTypingState={isTyping}
        isRecordingState={isRecording}
        isTranscriptionPending={transcribeMutation.isPending}
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
      className="relative p-2 rounded-full hover:bg-mage-gray-100 dark:hover:bg-mage-gray-800 transition-colors"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-mage-black dark:text-white">
        <path
          d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="7"
          r="4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {hasNotification && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-1 right-1 w-3 h-3 bg-mage-blue rounded-full border-2 border-white dark:border-mage-gray-900"
        />
      )}
    </button>
  );
}
