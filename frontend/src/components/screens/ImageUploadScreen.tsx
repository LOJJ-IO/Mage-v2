'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import Image from 'next/image';

export function ImageUploadScreen() {
  const {
    transition,
    addAttachedImage,
    attachedImages,
    removeAttachedImage,
  } = useMageStore();

  const [selectedImages, setSelectedImages] = useState<
    Array<{ id: string; file: File; preview: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) return;

      const newImages = Array.from(files).map((file) => ({
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview: URL.createObjectURL(file),
      }));

      setSelectedImages((prev) => [...prev, ...newImages]);
    },
    []
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

  // Trigger file picker
  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const totalImages = attachedImages.length + selectedImages.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-white flex flex-col"
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-mage-gray-200 flex items-center justify-between safe-area-top">
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
      <main className="flex-1 overflow-y-auto p-4">
        {/* Selected images grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <AnimatePresence mode="popLayout">
            {/* Existing attached images */}
            {attachedImages.map((image) => (
              <motion.div
                key={image.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="relative aspect-square rounded-uber-lg overflow-hidden"
              >
                <Image
                  src={image.preview}
                  alt="Attached"
                  fill
                  className="object-cover"
                />
                <button
                  onClick={() => removeAttachedImage(image.id)}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
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
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="relative aspect-square rounded-uber-lg overflow-hidden"
              >
                <Image
                  src={image.preview}
                  alt="Selected"
                  fill
                  className="object-cover"
                />
                <button
                  onClick={() => handleRemoveImage(image.id)}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
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
              onClick={openFilePicker}
              className="aspect-square rounded-uber-lg border-2 border-dashed border-mage-gray-300 flex flex-col items-center justify-center gap-2 hover:border-mage-gray-400 hover:bg-mage-gray-50 transition-colors"
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
          className="p-4 border-t border-mage-gray-200 safe-area-bottom"
        >
          <button
            onClick={handleConfirm}
            className="w-full py-4 bg-mage-black text-white rounded-uber-full font-semibold text-lg active:scale-[0.98] transition-transform"
          >
            Attach {selectedImages.length} Photo
            {selectedImages.length !== 1 ? 's' : ''}
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
