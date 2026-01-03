import { useState, useRef, useCallback, useEffect } from 'react';
import { MicPermission } from '@/types';
import { MAX_RECORDING_DURATION } from '@/lib/stateMachine';

interface UseVoiceRecordingConfig {
  onRecordingStart?: () => void;
  onRecordingStop?: (blob: Blob) => void;
  onRecordingError?: (error: Error) => void;
  onPermissionChange?: (status: MicPermission) => void;
  maxDuration?: number;
}

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  permission: MicPermission;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  requestPermission: () => Promise<MicPermission>;
}

export function useVoiceRecording(config: UseVoiceRecordingConfig = {}): UseVoiceRecordingReturn {
  const {
    onRecordingStart,
    onRecordingStop,
    onRecordingError,
    onPermissionChange,
    maxDuration = MAX_RECORDING_DURATION,
  } = config;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [permission, setPermission] = useState<MicPermission>('prompt');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check permission status
  const checkPermission = useCallback(async (): Promise<MicPermission> => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const status = result.state as MicPermission;
      setPermission(status);
      onPermissionChange?.(status);
      return status;
    } catch {
      // Fallback for browsers that don't support permission query
      return 'prompt';
    }
  }, [onPermissionChange]);

  // Request microphone permission
  const requestPermission = useCallback(async (): Promise<MicPermission> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermission('granted');
      onPermissionChange?.('granted');
      return 'granted';
    } catch (error) {
      setPermission('denied');
      onPermissionChange?.('denied');
      return 'denied';
    }
  }, [onPermissionChange]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      // Request permission if not granted
      if (permission !== 'granted') {
        const newPermission = await requestPermission();
        if (newPermission !== 'granted') {
          throw new Error('Microphone permission denied');
        }
      }

      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        onRecordingStop?.(blob);
        
        // Stop all tracks
        streamRef.current?.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.onerror = (event) => {
        const error = new Error('Recording error');
        onRecordingError?.(error);
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      onRecordingStart?.();

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        setDuration((prev) => {
          const newDuration = prev + 1;
          if (newDuration >= maxDuration) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);

    } catch (error) {
      onRecordingError?.(error as Error);
    }
  }, [permission, requestPermission, maxDuration, onRecordingStart, onRecordingStop, onRecordingError]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
  }, []);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);

      durationIntervalRef.current = setInterval(() => {
        setDuration((prev) => {
          const newDuration = prev + 1;
          if (newDuration >= maxDuration) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);
    }
  }, [maxDuration, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // Check permission on mount
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  return {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    permission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    requestPermission,
  };
}

// Format duration as MM:SS
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
