'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { useVoiceRecording, formatDuration } from '@/hooks/useVoiceRecording';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { ImageAttachment } from '@/types';
import Image from 'next/image';

interface ChatInputProps {
  onSend: (text: string, images?: string[]) => void;
  onUpload: () => void;
  isTypingState: boolean;
  isRecordingState: boolean;
  isLockedRecording: boolean;
}

export function ChatInput({
  onSend,
  onUpload,
  isTypingState,
  isRecordingState,
  isLockedRecording,
}: ChatInputProps) {
  const {
    inputText,
    setInputText,
    attachedImages,
    removeAttachedImage,
    clearAttachedImages,
    transition,
    addToast,
    setRecording,
    recording,
  } = useMageStore();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Voice recording
  const {
    isRecording,
    duration,
    audioBlob,
    startRecording,
    stopRecording,
    permission,
    requestPermission,
  } = useVoiceRecording({
    onRecordingStart: () => {
      setRecording({ isRecording: true, duration: 0 });
    },
    onRecordingStop: (blob) => {
      setRecording({ isRecording: false, audioBlob: blob });
      // Transition to transcribing
      transition('RELEASE_HOLD');
    },
    onRecordingError: (error) => {
      addToast({
        type: 'error',
        message: 'Recording failed. Please try again.',
      });
      transition('TAP_CANCEL');
    },
  });

  // Swipe gesture for recording lock
  const { handlers: swipeHandlers, deltaY } = useSwipeGesture({
    onSwipeUp: () => {
      if (isRecordingState && !isLockedRecording) {
        transition('SWIPE_UP');
        setRecording({ isLocked: true });
      }
    },
    onSwipeLeft: () => {
      if (isRecordingState) {
        stopRecording();
        transition('SWIPE_LEFT');
        setRecording({ isRecording: false, isLocked: false });
      }
    },
    onSwipeDown: () => {
      if (isLockedRecording) {
        transition('SWIPE_DOWN');
        setRecording({ isLocked: false });
      }
    },
    threshold: 50,
  });

  // Update duration in store
  useEffect(() => {
    if (isRecording) {
      setRecording({ duration });
    }
  }, [duration, isRecording, setRecording]);

  // Focus input when entering typing state
  useEffect(() => {
    if (isTypingState && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTypingState]);

  // Handle focus
  const handleFocus = () => {
    setIsFocused(true);
    transition('FOCUS_INPUT');
  };

  // Handle blur
  const handleBlur = () => {
    setIsFocused(false);
    if (!inputText.trim() && attachedImages.length === 0) {
      transition('DISMISS_KEYBOARD');
    }
  };

  // Handle send
  const handleSend = () => {
    const text = inputText.trim();
    const images = attachedImages.map((img) => img.preview);

    if (text || images.length > 0) {
      onSend(text, images.length > 0 ? images : undefined);
      setInputText('');
      clearAttachedImages();
      transition('TAP_SEND');
    }
  };

  // Handle mic press start
  const handleMicPressStart = async () => {
    if (permission !== 'granted') {
      const newPermission = await requestPermission();
      if (newPermission !== 'granted') {
        addToast({
          type: 'error',
          message: 'Microphone access denied',
        });
        return;
      }
    }
    
    transition('HOLD_MIC');
    startRecording();
  };

  // Handle mic press end
  const handleMicPressEnd = () => {
    if (isRecordingState && !isLockedRecording) {
      stopRecording();
    }
  };

  // Handle locked recording send
  const handleLockedSend = () => {
    stopRecording();
    transition('TAP_SEND');
  };

  // Handle unlock
  const handleUnlock = () => {
    transition('TAP_UNLOCK');
    setRecording({ isLocked: false });
  };

  // Handle cancel recording
  const handleCancelRecording = () => {
    stopRecording();
    transition('TAP_CANCEL');
    setRecording({ isRecording: false, isLocked: false });
  };

  const hasContent = inputText.trim() || attachedImages.length > 0;

  return (
    <div className="relative safe-area-bottom">
      {/* Recording UI */}
      <AnimatePresence>
        {(isRecordingState || isLockedRecording) && (
          <RecordingOverlay
            duration={duration}
            isLocked={isLockedRecording}
            onCancel={handleCancelRecording}
            onSend={handleLockedSend}
            onUnlock={handleUnlock}
            swipeHandlers={swipeHandlers}
            deltaY={deltaY}
          />
        )}
      </AnimatePresence>

      {/* Normal input UI */}
      {!isRecordingState && !isLockedRecording && (
        <div className="px-4 py-3 bg-white border-t border-mage-gray-200">
          {/* Attached images preview */}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
              {attachedImages.map((img) => (
                <div key={img.id} className="relative flex-shrink-0">
                  <div className="w-16 h-16 rounded-uber overflow-hidden">
                    <Image
                      src={img.preview}
                      alt="Attachment"
                      width={64}
                      height={64}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <button
                    onClick={() => removeAttachedImage(img.id)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-mage-black text-white rounded-full flex items-center justify-center"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M9 3L3 9M3 3l6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Upload button */}
            <button
              onClick={onUpload}
              className="flex-shrink-0 p-3 rounded-full hover:bg-mage-gray-100 transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
                  stroke="#000"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Text input */}
            <div className="flex-1 relative h-12">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="Message..."
                rows={1}
                className="
                  w-full px-4 py-3 pr-12
                  bg-mage-gray-100 rounded-uber-xl
                  text-base font-medium resize-none
                  placeholder:text-mage-gray-400
                  focus:outline-none focus:ring-2 focus:ring-mage-black/10
                  transition-all
                "
                style={{
                  minHeight: '48px',
                  maxHeight: '120px',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>

            {/* Send / Mic button */}
            {hasContent ? (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={handleSend}
                className="
                  flex-shrink-0 w-12 h-12
                  bg-mage-black text-white rounded-full
                  flex items-center justify-center
                  active:scale-95 transition-transform
                "
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M18.333 1.667L9.167 10.833M18.333 1.667l-6.666 16.666-3.334-7.5-7.5-3.333 16.667-6.666z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.button>
            ) : (
              <button
                ref={micButtonRef}
                onTouchStart={handleMicPressStart}
                onTouchEnd={handleMicPressEnd}
                onMouseDown={handleMicPressStart}
                onMouseUp={handleMicPressEnd}
                onMouseLeave={handleMicPressEnd}
                className="
                  flex-shrink-0 w-12 h-12
                  bg-mage-gray-100 rounded-full
                  flex items-center justify-center
                  hover:bg-mage-gray-200 active:bg-mage-gray-300
                  transition-colors select-none
                "
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 1.667a2.5 2.5 0 00-2.5 2.5v5.833a2.5 2.5 0 105 0V4.167a2.5 2.5 0 00-2.5-2.5z"
                    stroke="#000"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15.833 8.333v1.667a5.833 5.833 0 11-11.666 0V8.333M10 15.833v2.5M6.667 18.333h6.666"
                    stroke="#000"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Recording overlay component
interface RecordingOverlayProps {
  duration: number;
  isLocked: boolean;
  onCancel: () => void;
  onSend: () => void;
  onUnlock: () => void;
  swipeHandlers: ReturnType<typeof useSwipeGesture>['handlers'];
  deltaY: number;
}

function RecordingOverlay({
  duration,
  isLocked,
  onCancel,
  onSend,
  onUnlock,
  swipeHandlers,
  deltaY,
}: RecordingOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-x-0 bottom-0 bg-white border-t border-mage-gray-200 safe-area-bottom"
      {...swipeHandlers}
    >
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="px-4 py-2 text-mage-red font-medium rounded-uber-full hover:bg-mage-red/10 transition-colors"
          >
            Cancel
          </button>

          {/* Duration */}
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-3 h-3 rounded-full bg-mage-red"
            />
            <span className="text-lg font-semibold tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Lock indicator / Send button */}
          {isLocked ? (
            <button
              onClick={onSend}
              className="px-4 py-2 bg-mage-black text-white font-medium rounded-uber-full active:scale-95 transition-transform"
            >
              Send
            </button>
          ) : (
            <div className="w-20" /> // Spacer
          )}
        </div>

        {/* Instructions */}
        <div className="text-center">
          {isLocked ? (
            <div className="space-y-2">
              <p className="text-mage-gray-500 text-sm">
                Recording locked • Tap Send when ready
              </p>
              <button
                onClick={onUnlock}
                className="text-mage-blue text-sm font-medium"
              >
                Tap to unlock
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-mage-gray-500 text-sm">
                Release to send • Swipe up to lock
              </p>
              <motion.div
                animate={{ y: Math.min(0, deltaY * 0.3) }}
                className="flex justify-center"
              >
                <div className="flex flex-col items-center">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-mage-gray-400"
                  >
                    <path
                      d="M12 19V5M5 12l7-7 7 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-xs text-mage-gray-400 mt-1">
                    Swipe up to lock
                  </span>
                </div>
              </motion.div>
            </div>
          )}
        </div>

        {/* Swipe left to cancel hint */}
        {!isLocked && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-mage-gray-400">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 12L6 8l4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs">Cancel</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
