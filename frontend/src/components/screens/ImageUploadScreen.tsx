'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import Image from 'next/image';

const MAX_ATTACHMENTS = 5;

export function ImageUploadScreen() {
  const {
    transition,
    addAttachedImage,
    attachedImages,
    removeAttachedImage,
    addToast,
  } = useMageStore();

  const [selectedImages, setSelectedImages] = useState<
    Array<{ id: string; file: File; preview: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection (capped at MAX_ATTACHMENTS total)
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) return;

      const currentTotal = attachedImages.length + selectedImages.length;
      const remaining = Math.max(0, MAX_ATTACHMENTS - currentTotal);
      if (remaining === 0) {
        addToast({
          type: 'info',
          message: `Maximum ${MAX_ATTACHMENTS} photos allowed.`,
          duration: 3000,
        });
        event.target.value = '';
        return;
      }

      const fileList = Array.from(files);
      const toAdd = fileList.slice(0, remaining);
      const over = fileList.length - toAdd.length;

      const newImages = toAdd.map((file) => ({
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview: URL.createObjectURL(file),
      }));

      setSelectedImages((prev) => [...prev, ...newImages]);
      if (over > 0) {
        addToast({
          type: 'info',
          message: `Maximum ${MAX_ATTACHMENTS} photos. ${over} not added.`,
          duration: 3000,
        });
      }
      event.target.value = '';
    },
    [attachedImages.length, selectedImages.length, addToast]
  );

  // Handle image removal
  const handleRemoveImage = useCallback((id: string) => {
    setSelectedImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    // Add selected images to store
    selectedImages.forEach((image) => {
      addAttachedImage({
        id: image.id,
        file: image.file,
        preview: image.preview,
      });
    });

    setSelectedImages([]);
    transition('CONFIRM_IMAGES');
  }, [selectedImages, addAttachedImage, transition]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    // Clean up previews
    selectedImages.forEach((image) => {
      URL.revokeObjectURL(image.preview);
    });
    setSelectedImages([]);
    transition('CONFIRM_IMAGES'); // Return to previous state
  }, [selectedImages, transition]);

  // Trigger file picker (or show toast if at cap)
  const openFilePicker = () => {
    const total = attachedImages.length + selectedImages.length;
    if (total >= MAX_ATTACHMENTS) {
      addToast({
        type: 'info',
        message: `Maximum ${MAX_ATTACHMENTS} photos allowed.`,
        duration: 3000,
      });
      return;
    }
    fileInputRef.current?.click();
  };

  const totalImages = attachedImages.length + selectedImages.length;
  const atCap = totalImages >= MAX_ATTACHMENTS;

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-white flex flex-col items-center"
    >
      <div className="w-full max-w-md flex flex-col flex-1 min-h-0">
        {/* Header */}
        <header className="px-4 py-3 border-b border-mage-gray-200 flex items-center justify-between safe-area-top flex-shrink-0">
        <button
          onClick={handleCancel}
          className="p-2 -ml-2 rounded-full hover:bg-mage-gray-100 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="#000"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Add Photos</h1>
        <button
          onClick={handleConfirm}
          disabled={selectedImages.length === 0 && attachedImages.length === 0}
          className={`
            px-4 py-2 rounded-uber-full font-semibold text-sm
            ${
              selectedImages.length > 0 || attachedImages.length > 0
                ? 'bg-mage-black text-white'
                : 'bg-mage-gray-200 text-mage-gray-400'
            }
            transition-colors
          `}
        >
          Done ({totalImages})
        </button>
        </header>

        {/* Content */}
        <main className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Selected images grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <AnimatePresence mode="popLayout">
            {/* Existing attached images */}
            {attachedImages.map((image) => (
              <motion.div
                key={image.id}
                layout
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{
                  layout: { type: 'spring', stiffness: 260, damping: 28 },
                  opacity: { duration: 0.2 },
                  scale: { type: 'spring', stiffness: 400, damping: 25 },
                }}
                className="relative aspect-square rounded-uber-lg"
              >
                <div className="absolute inset-0 overflow-hidden rounded-uber-lg">
                  <Image
                    src={image.preview}
                    alt="Attached"
                    fill
                    className="object-cover"
                  />
                </div>
                <button
                  onClick={() => removeAttachedImage(image.id)}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center z-10"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M9 3L3 9M3 3l6 6"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded-full text-xs text-white">
                  Added
                </div>
              </motion.div>
            ))}

            {/* Newly selected images */}
            {selectedImages.map((image) => (
              <motion.div
                key={image.id}
                layout
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{
                  layout: { type: 'spring', stiffness: 260, damping: 28 },
                  opacity: { duration: 0.2 },
                  scale: { type: 'spring', stiffness: 400, damping: 25 },
                }}
                className="relative aspect-square rounded-uber-lg"
              >
                <div className="absolute inset-0 overflow-hidden rounded-uber-lg">
                  <Image
                    src={image.preview}
                    alt="Selected"
                    fill
                    className="object-cover"
                  />
                </div>
                <button
                  onClick={() => handleRemoveImage(image.id)}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center z-10"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M9 3L3 9M3 3l6 6"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </motion.div>
            ))}

            {/* Add more button */}
            <motion.button
              layout
              transition={{
                layout: { type: 'spring', stiffness: 260, damping: 28 },
              }}
              onClick={openFilePicker}
              className={`aspect-square rounded-uber-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors duration-200 ${
                atCap
                  ? 'border-mage-gray-200 bg-mage-gray-50 cursor-not-allowed opacity-60'
                  : 'border-mage-gray-300 hover:border-mage-gray-400 hover:bg-mage-gray-50'
              }`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="#757575"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-xs text-mage-gray-500">Add</span>
            </motion.button>
          </AnimatePresence>
          </div>

          {/* Empty state */}
        {totalImages === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <div className="w-20 h-20 bg-mage-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M28 25.333V6.667A2.667 2.667 0 0025.333 4H6.667A2.667 2.667 0 004 6.667v18.666A2.667 2.667 0 006.667 28h18.666A2.667 2.667 0 0028 25.333z"
                  stroke="#CBCBCB"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11.333 13.333a2 2 0 100-4 2 2 0 000 4zM28 20l-5.333-5.333L6.667 28"
                  stroke="#CBCBCB"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-mage-black mb-2">
              No photos selected
            </h3>
            <p className="text-mage-gray-500 mb-6">
              Add photos to share with your message
            </p>
            <button
              onClick={openFilePicker}
              className="px-6 py-3 bg-mage-black text-white rounded-uber-full font-semibold active:scale-[0.98] transition-transform"
            >
              Select Photos
            </button>
          </motion.div>
        )}
        </main>

          {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Bottom action bar (when images selected) */}
        {selectedImages.length > 0 && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="pt-3 px-4 pb-3 mb-4 safe-area-bottom flex-shrink-0 border-t border-mage-gray-200"
          >
            <button
              onClick={handleConfirm}
              className="w-full max-w-xs mx-auto block py-4 bg-mage-black text-white rounded-uber-full font-semibold text-lg active:scale-[0.98] transition-transform"
            >
              Attach {totalImages} Photo
              {totalImages !== 1 ? 's' : ''}
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
