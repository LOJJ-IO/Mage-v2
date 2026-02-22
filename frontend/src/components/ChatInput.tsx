'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { useVoiceRecording, formatDuration } from '@/hooks/useVoiceRecording';
import { ImageAttachment } from '@/types';
import Image from 'next/image';

interface ChatInputProps {
  onSend: (text: string, images?: string[]) => void;
  onUpload: () => void;
  isTypingState: boolean;
  isRecordingState: boolean;
  isTranscriptionPending?: boolean;
}

export function ChatInput({
  onSend,
  onUpload,
  isTypingState,
  isRecordingState,
  isTranscriptionPending = false,
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

  // Handle mic press start (disabled while transcription is in progress)
  const handleMicPressStart = async () => {
    if (isTranscriptionPending) return;
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

  // Handle mic press end (release to send)
  const handleMicPressEnd = () => {
    if (isRecordingState) {
      stopRecording();
    }
  };

  // Handle cancel recording
  const handleCancelRecording = () => {
    stopRecording();
    transition('TAP_CANCEL');
    setRecording({ isRecording: false, isLocked: false });
  };

  // Handle send recording: only stop; onRecordingStop will set blob and transition to transcribing
  const handleSendRecording = () => {
    stopRecording();
  };

  const hasContent = inputText.trim() || attachedImages.length > 0;

  return (
    <div className="relative">
      {/* Recording UI - fixed at bottom */}
      <AnimatePresence>
        {isRecordingState && (
          <RecordingOverlay
            duration={duration}
            onCancel={handleCancelRecording}
            onSend={handleSendRecording}
          />
        )}
      </AnimatePresence>

      {/* Normal input UI - fixed at bottom, constrained to mobile width */}
      {!isRecordingState && (
        <div className="fixed inset-x-0 bottom-5 left-0 right-0 w-full max-w-md mx-auto z-30 px-4 pt-4 pb-4 bg-white dark:bg-mage-gray-900 border-t border-mage-gray-200 dark:border-mage-gray-700 safe-area-bottom overflow-visible">
          {/* Attached images preview */}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 pt-3 pr-3">
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
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center z-10 shrink-0"
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
              className="flex-shrink-0 p-3 rounded-full hover:bg-mage-gray-100 dark:hover:bg-mage-gray-800 transition-colors text-mage-black dark:text-white"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
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
                placeholder=" Message..."
                rows={1}
                className="
                  w-full px-4 py-3 pr-12
                  bg-mage-gray-100 dark:bg-mage-gray-800 rounded-uber-xl
                  text-base font-medium resize-none text-mage-black dark:text-white
                  placeholder:text-mage-gray-400 dark:placeholder:text-mage-gray-500
                  focus:outline-none focus:ring-2 focus:ring-mage-black/10 dark:focus:ring-white/20
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
                  bg-mage-black dark:bg-mage-gray-100 text-white dark:text-mage-black rounded-full
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
                disabled={isTranscriptionPending}
                aria-busy={isTranscriptionPending}
                className={`
                  flex-shrink-0 w-12 h-12 rounded-full
                  flex items-center justify-center text-mage-black dark:text-white
                  transition-colors select-none
                  ${isTranscriptionPending ? 'opacity-50 cursor-not-allowed' : 'bg-mage-gray-100 dark:bg-mage-gray-700 hover:bg-mage-gray-200 dark:hover:bg-mage-gray-600 active:bg-mage-gray-300 dark:active:bg-mage-gray-500'}
                `}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 1.667a2.5 2.5 0 00-2.5 2.5v5.833a2.5 2.5 0 105 0V4.167a2.5 2.5 0 00-2.5-2.5z" />
                  <path d="M15.833 8.333v1.667a5.833 5.833 0 11-11.666 0V8.333M10 15.833v2.5M6.667 18.333h6.666" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Recording overlay: Cancel or Send (and release to send)
interface RecordingOverlayProps {
  duration: number;
  onCancel: () => void;
  onSend: () => void;
}

function RecordingOverlay({ duration, onCancel, onSend }: RecordingOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-x-0 bottom-3 w-full max-w-md mx-auto z-40 bg-white dark:bg-mage-gray-900 border-t border-mage-gray-200 dark:border-mage-gray-700 safe-area-bottom select-none touch-none"
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-mage-red font-medium rounded-uber-full bg-mage-red/10 hover:bg-mage-red/20 transition-colors"
          >
            Cancel
          </button>
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
          <button
            onClick={onSend}
            className="px-4 py-2 bg-mage-black text-white font-medium rounded-uber-full active:scale-95 transition-transform"
          >
            Send
          </button>
        </div>
      </div>
    </motion.div>
  );
}
