import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  StateId,
  AppContext,
  Message,
  Toast,
  Trigger,
  RecordingState,
  ImageAttachment,
  GuestProfile,
  Ticket,
  StateHistoryEntry,
  ConversationContext,
} from '@/types';
import {
  getEntryState,
  isValidTransition,
  RECORDING_PRESERVE_STATES,
} from '@/lib/stateMachine';

interface MageState {
  // Current state
  currentState: StateId;
  stateHistory: StateHistoryEntry[];
  
  // Context
  context: AppContext;
  
  // Messages
  messages: Message[];
  
  // Input state
  inputText: string;
  attachedImages: ImageAttachment[];
  
  // Recording state
  recording: RecordingState;
  
  // Toast notifications
  toasts: Toast[];
  activeToastType: string | null; // Prevent duplicate toasts
  
  // Guest profile
  guestProfile: GuestProfile | null;
  
  // Active ticket
  activeTicket: Ticket | null;
  
  // Connection countdown
  connectionCountdown: number | null;
  
  // UI state
  isLoading: boolean;
  theme: 'light' | 'dark';

  // Persist rehydration (set by persist middleware; do not persist this key)
  _hasHydrated: boolean;

  // Actions
  transition: (trigger: Trigger) => boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  setContext: (updates: Partial<AppContext>) => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setMessages: (messages: Message[]) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setInputText: (text: string) => void;
  addAttachedImage: (image: ImageAttachment) => void;
  removeAttachedImage: (id: string) => void;
  clearAttachedImages: () => void;
  setRecording: (recording: Partial<RecordingState>) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  setGuestProfile: (profile: GuestProfile) => void;
  setActiveTicket: (ticket: Ticket | null) => void;
  setConnectionCountdown: (count: number | null) => void;
  setLoading: (loading: boolean) => void;
  setHasHydrated: (value: boolean) => void;
  goBack: () => void;
  reset: () => void;
}

const initialContext: AppContext = {
  conversationContext: 'BOT',
  hasSeenWelcome: false,
  aiAgentAvailable: true,
  humanAgentAvailable: false,
  micPermission: 'prompt',
  deleteTicket: false,
  retainTicket: false,
  isPaidUser: true, // Default to paid for demo
  agentNotificationPending: false,
};

const initialRecording: RecordingState = {
  isRecording: false,
  isLocked: false,
  duration: 0,
  audioBlob: undefined,
};

export const useMageStore = create<MageState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentState: 'S-G-001',
      stateHistory: [],
      context: initialContext,
      messages: [],
      inputText: '',
      attachedImages: [],
      recording: initialRecording,
      toasts: [],
      activeToastType: null,
      guestProfile: null,
      activeTicket: null,
      connectionCountdown: null,
      isLoading: false,
      theme: 'light',
      _hasHydrated: false,

      // Transition to a new state
      transition: (trigger: Trigger) => {
        const state = get();
        const transition = isValidTransition(
          state.currentState,
          trigger,
          {
            hasSeenWelcome: state.context.hasSeenWelcome,
            humanAgentAvailable: state.context.humanAgentAvailable,
            aiAgentAvailable: state.context.aiAgentAvailable,
            isPaidUser: state.context.isPaidUser,
          }
        );

        if (!transition) {
          console.warn(`Invalid transition: ${state.currentState} + ${trigger}`);
          return false;
        }

        // Handle PREVIOUS navigation
        if (transition.to === 'PREVIOUS') {
          get().goBack();
          return true;
        }

        // Save current state to history (for PREVIOUS navigation)
        const historyEntry: StateHistoryEntry = {
          stateId: state.currentState,
          context: { ...state.context },
          inputText: state.inputText,
          recording: RECORDING_PRESERVE_STATES.includes(state.currentState)
            ? { ...state.recording }
            : undefined,
        };

        // Check if we should show recording toast when navigating away
        const isLeavingRecording = RECORDING_PRESERVE_STATES.includes(state.currentState);
        const isGoingToProfile = transition.to === 'S-G-008';
        
        set((s) => {
          const newState: Partial<MageState> = {
            currentState: transition.to as StateId,
            stateHistory: [...s.stateHistory, historyEntry],
          };

          // Update context if transition specifies it
          if (transition.context) {
            newState.context = {
              ...s.context,
              conversationContext: transition.context,
            };
          }

          return newState;
        });

        // Show recording preserved toast if applicable
        if (isLeavingRecording && isGoingToProfile && state.recording.isRecording) {
          get().addToast({
            type: 'info',
            message: 'Recording paused - still active',
            duration: 3000,
          });
        }

        return true;
      },

      // Go back to previous state
      goBack: () => {
        const state = get();
        if (state.stateHistory.length === 0) return;

        const previousEntry = state.stateHistory[state.stateHistory.length - 1];
        
        set({
          currentState: previousEntry.stateId,
          stateHistory: state.stateHistory.slice(0, -1),
          inputText: previousEntry.inputText || state.inputText,
          recording: previousEntry.recording || state.recording,
        });
      },

      // Update context
      setContext: (updates: Partial<AppContext>) => {
        set((state) => ({
          context: { ...state.context, ...updates },
        }));
      },

      // Add a message
      addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => {
        const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        set((state) => ({
          messages: [
            ...state.messages,
            {
              ...message,
              id,
              timestamp: new Date(),
            },
          ],
        }));
      },

      setMessages: (messages: Message[]) => {
        set({ messages });
      },

      updateMessage: (id: string, updates: Partial<Message>) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        }));
      },

      // Set input text
      setInputText: (text: string) => {
        set({ inputText: text });
      },

      // Add attached image
      addAttachedImage: (image: ImageAttachment) => {
        set((state) => ({
          attachedImages: [...state.attachedImages, image],
        }));
      },

      // Remove attached image
      removeAttachedImage: (id: string) => {
        set((state) => ({
          attachedImages: state.attachedImages.filter((img) => img.id !== id),
        }));
      },

      // Clear all attached images
      clearAttachedImages: () => {
        set({ attachedImages: [] });
      },

      // Set recording state
      setRecording: (recording: Partial<RecordingState>) => {
        set((state) => ({
          recording: { ...state.recording, ...recording },
        }));
      },

      // Add toast notification (prevents duplicates)
      addToast: (toast: Omit<Toast, 'id'>) => {
        const state = get();
        
        // Prevent duplicate toasts of the same type
        if (state.activeToastType === toast.type) return;
        
        const id = `toast-${Date.now()}`;
        set((s) => ({
          toasts: [...s.toasts, { ...toast, id }],
          activeToastType: toast.type,
        }));

        // Auto-remove after duration
        if (toast.duration !== 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, toast.duration || 4000);
        }
      },

      // Remove toast
      removeToast: (id: string) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
          activeToastType: state.toasts.length <= 1 ? null : state.activeToastType,
        }));
      },

      // Set guest profile
      setGuestProfile: (profile: GuestProfile) => {
        set({ guestProfile: profile });
      },

      // Set active ticket
      setActiveTicket: (ticket: Ticket | null) => {
        set({ activeTicket: ticket });
      },

      // Set connection countdown
      setConnectionCountdown: (count: number | null) => {
        set({ connectionCountdown: count });
      },

      // Set loading state
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setTheme: (theme: 'light' | 'dark') => {
        set({ theme });
      },

      // Mark store as rehydrated (called by persist middleware)
      setHasHydrated: (value: boolean) => {
        set({ _hasHydrated: value });
      },

      // Reset to initial state
      reset: () => {
        set({
          currentState: getEntryState(false),
          stateHistory: [],
          context: initialContext,
          messages: [],
          inputText: '',
          attachedImages: [],
          recording: initialRecording,
          toasts: [],
          activeToastType: null,
          activeTicket: null,
          connectionCountdown: null,
          isLoading: false,
        });
      },
    }),
    {
      name: 'mage-storage',
      partialize: (state) => ({
        context: {
          hasSeenWelcome: state.context.hasSeenWelcome,
        },
        guestProfile: state.guestProfile,
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state, err) => {
        useMageStore.getState().setHasHydrated(true);
      },
    }
  )
);
