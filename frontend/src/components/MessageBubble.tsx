'use client';

import { motion } from 'framer-motion';
import { Message } from '@/types';
import Image from 'next/image';
import { FaqPanel } from '@/components/FaqPanel';
import { formatMessageTime } from '@/lib/parseTimestamp';

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  onFaqHelpful?: (message: Message) => void;
  onFaqNeedHelp?: (message: Message) => void;
  faqFeedbackPending?: boolean;
}

export function MessageBubble({
  message,
  isLast = false,
  onFaqHelpful,
  onFaqNeedHelp,
  faqFeedbackPending = false,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStaff = message.role === 'staff';
  const isSystem = message.role === 'system';
  const isFaq = message.kind === 'faq' && message.faqItems && message.faqItems.length > 0;

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center my-4"
      >
        <div className="bg-mage-gray-100 dark:bg-mage-gray-800 text-mage-gray-500 dark:text-mage-gray-400 px-4 py-2 rounded-uber-full text-sm">
          {message.content}
        </div>
      </motion.div>
    );
  }

  if (isFaq && !isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="flex justify-start mb-4"
      >
        <div className="min-w-0">
          <FaqPanel
            intro={message.intro || message.content}
            items={message.faqItems!}
            resolved={message.faqResolved}
            disabled={faqFeedbackPending}
            onHelpful={() => onFaqHelpful?.(message)}
            onNeedHelp={() => onFaqNeedHelp?.(message)}
          />
          <div className="text-xs mt-2 text-mage-gray-400 dark:text-mage-gray-500 pl-1">
            {formatTime(message.timestamp)}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div
        className={`
          max-w-[85%] min-w-0 px-4 py-3 rounded-uber-xl overflow-hidden
          ${isUser
            ? 'bg-mage-black dark:bg-mage-gray-100 text-white dark:text-mage-black rounded-br-sm'
            : isStaff
              ? 'bg-mage-blue/15 dark:bg-mage-blue/25 text-mage-black dark:text-white rounded-bl-sm border border-mage-blue/30'
              : 'bg-mage-gray-100 dark:bg-mage-gray-800 text-mage-black dark:text-white rounded-bl-sm'
          }
        `}
      >
        {isStaff && (
          <p className="text-xs font-medium text-mage-blue dark:text-mage-blue mb-1">
            Front desk
          </p>
        )}

        {message.images && message.images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.images.map((img, idx) => (
              <div
                key={idx}
                className="relative w-32 h-32 rounded-uber overflow-hidden"
              >
                <Image
                  src={img}
                  alt={`Attachment ${idx + 1}`}
                  fill
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )}

        <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {message.isTyping && (
          <div className="flex gap-1 mt-1">
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
              className="w-2 h-2 rounded-full bg-current"
            />
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
              className="w-2 h-2 rounded-full bg-current"
            />
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
              className="w-2 h-2 rounded-full bg-current"
            />
          </div>
        )}

        <div
          className={`
            text-xs mt-1
            ${isUser ? 'text-white/60 dark:text-mage-black/60' : 'text-mage-gray-400 dark:text-mage-gray-500'}
          `}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </motion.div>
  );
}

function formatTime(date: Date): string {
  return formatMessageTime(date);
}

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex justify-start mb-3"
    >
      <div className="bg-mage-gray-100 dark:bg-mage-gray-800 px-4 py-3 rounded-uber-xl rounded-bl-sm">
        <div className="flex gap-1">
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            className="w-2 h-2 rounded-full bg-mage-gray-400 dark:bg-mage-gray-500"
          />
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
            className="w-2 h-2 rounded-full bg-mage-gray-400 dark:bg-mage-gray-500"
          />
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
            className="w-2 h-2 rounded-full bg-mage-gray-400 dark:bg-mage-gray-500"
          />
        </div>
      </div>
    </motion.div>
  );
}
