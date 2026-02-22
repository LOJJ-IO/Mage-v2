'use client';

import {
  createContext,
  useCallback,
  useRef,
  useContext,
  ReactNode,
} from 'react';
import { useMageStore } from '@/store/mageStore';
import { MAX_RECORDING_DURATION } from '@/lib/stateMachine';

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

type RecordingContextValue = {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob>;
  requestPermission: () => Promise<'granted' | 'denied'>;
};

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error('useRecording must be used within RecordingProvider');
  return ctx;
}

export function RecordingProvider({ children }: { children: ReactNode }) {
  const setRecording = useMageStore((s) => s.setRecording);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');
  const resolveStopRef = useRef<((blob: Blob) => void) | null>(null);

  const requestPermission = useCallback(async (): Promise<'granted' | 'denied'> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return 'granted';
    } catch {
      return 'denied';
    }
  }, []);

  const startRecording = useCallback(async () => {
    const perm = await requestPermission();
    if (perm !== 'granted') throw new Error('Microphone permission denied');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = getSupportedMimeType() || 'audio/webm';
    mimeTypeRef.current = mimeType;

    const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const mime = mimeTypeRef.current;
      const setRec = useMageStore.getState().setRecording;
      setTimeout(() => {
        const blob = new Blob(chunksRef.current, { type: mime });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (resolveStopRef.current) {
          resolveStopRef.current(blob);
          resolveStopRef.current = null;
        } else {
          setRec({ audioBlob: blob });
        }
      }, 0);
    };

    mediaRecorder.onerror = () => {
      setRecording({ isRecording: false });
      if (resolveStopRef.current) {
        resolveStopRef.current(new Blob());
        resolveStopRef.current = null;
      }
    };

    mediaRecorder.start(100);
    setRecording({ isRecording: true, duration: 0 });

    intervalRef.current = setInterval(() => {
      const state = useMageStore.getState();
      const next = state.recording.duration + 1;
      if (next >= MAX_RECORDING_DURATION) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (mediaRecorderRef.current?.state !== 'inactive') {
          mediaRecorderRef.current?.stop();
        }
        setRecording({ isRecording: false });
        return;
      }
      setRecording({ duration: next });
    }, 1000);
  }, [requestPermission, setRecording]);

  const stopRecording = useCallback((): Promise<Blob> => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRecording({ isRecording: false });

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      return new Promise<Blob>((resolve) => {
        resolveStopRef.current = resolve;
        mediaRecorderRef.current!.stop();
        mediaRecorderRef.current = null;
      });
    }
    return Promise.resolve(new Blob());
  }, [setRecording]);

  const value: RecordingContextValue = {
    startRecording,
    stopRecording,
    requestPermission,
  };

  return (
    <RecordingContext.Provider value={value}>
      {children}
    </RecordingContext.Provider>
  );
}
