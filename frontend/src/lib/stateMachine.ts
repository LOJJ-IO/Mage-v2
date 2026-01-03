import { StateId, StateName, StateDefinition, Transition, Trigger, ConversationContext } from '@/types';

// State definitions
export const STATES: Record<StateId, StateDefinition> = {
  'S-G-001': {
    id: 'S-G-001',
    name: 'Guest.Chat.Onboarding.Loading',
    description: 'Initial branded loading and session setup',
  },
  'S-G-002': {
    id: 'S-G-002',
    name: 'Guest.Chat.Conversation.Initial',
    description: 'First-time chat entry per booking',
  },
  'S-G-003': {
    id: 'S-G-003',
    name: 'Guest.Chat.Conversation.Idle',
    description: 'Resting chat view with no active input',
  },
  'S-G-004': {
    id: 'S-G-004',
    name: 'Guest.Chat.Conversation.Typing',
    description: 'Keyboard-focused editable text input',
  },
  'S-G-005': {
    id: 'S-G-005',
    name: 'Guest.Chat.Conversation.Recording',
    description: 'Active hold-to-record voice input',
  },
  'S-G-006': {
    id: 'S-G-006',
    name: 'Guest.Chat.Conversation.LockedRecording',
    description: 'Hands-free locked voice recording',
  },
  'S-G-007': {
    id: 'S-G-007',
    name: 'Guest.Chat.Conversation.Transcribing',
    description: 'Audio-to-text processing',
  },
  'S-G-008': {
    id: 'S-G-008',
    name: 'Guest.Profile.Viewing.Card',
    description: 'Guest profile and service actions',
  },
  'S-G-009': {
    id: 'S-G-009',
    name: 'Guest.Service.Connection.Loading',
    description: 'Ticket creation & agent routing (8s countdown)',
  },
  'S-G-010': {
    id: 'S-G-010',
    name: 'Guest.Upload.Image.Selecting',
    description: 'Image selection & confirmation',
  },
  'S-G-011': {
    id: 'S-G-011',
    name: 'Guest.Service.Conversation.Deferred',
    description: 'No-agent explanation & issue capture',
  },
};

// Transition matrix
export const TRANSITIONS: Transition[] = [
  // Global navigation (wildcard transitions)
  { from: '*', trigger: 'SWIPE_RTL_OR_PROFILE', to: 'S-G-008' },
  { from: 'S-G-008', trigger: 'BACK', to: 'PREVIOUS' },
  { from: '*', trigger: 'SWIPE_LTR', to: 'PREVIOUS' },

  // Entry point transitions
  { from: 'ENTRY', condition: 'has_seen_welcome=false', to: 'S-G-001' },
  { from: 'ENTRY', condition: 'has_seen_welcome=true', to: 'S-G-003' },

  // Onboarding flow
  { from: 'S-G-001', trigger: 'LOAD_COMPLETE', to: 'S-G-002' },
  { from: 'S-G-002', trigger: 'CONTINUE', to: 'S-G-003' },

  // Chat input transitions
  { from: 'S-G-003', trigger: 'FOCUS_INPUT', to: 'S-G-004' },
  { from: 'S-G-004', trigger: 'DISMISS_KEYBOARD', to: 'S-G-003' },

  // Voice recording from Idle
  { from: 'S-G-003', trigger: 'HOLD_MIC', to: 'S-G-005' },

  // Recording state transitions
  { from: 'S-G-005', trigger: 'SWIPE_UP', to: 'S-G-006' },
  { from: 'S-G-005', trigger: 'SWIPE_LEFT', to: 'S-G-003' },
  { from: 'S-G-005', trigger: 'RELEASE_HOLD', to: 'S-G-007' },
  { from: 'S-G-005', trigger: 'TAP_CANCEL', to: 'S-G-003' },

  // Locked recording transitions
  { from: 'S-G-006', trigger: 'TAP_UNLOCK', to: 'S-G-005' },
  { from: 'S-G-006', trigger: 'SWIPE_DOWN', to: 'S-G-005' },
  { from: 'S-G-006', trigger: 'TAP_SEND', to: 'S-G-007' },

  // Transcription results
  { from: 'S-G-007', trigger: 'TRANSCRIPTION_SUCCESS', to: 'S-G-004' },
  { from: 'S-G-007', trigger: 'TRANSCRIPTION_FAIL', to: 'S-G-003' },

  // Send message
  { from: 'S-G-004', trigger: 'TAP_SEND', to: 'S-G-003' },

  // Image upload
  { from: 'S-G-003', trigger: 'UPLOAD', to: 'S-G-010' },
  { from: 'S-G-004', trigger: 'UPLOAD', to: 'S-G-010' },
  { from: 'S-G-010', trigger: 'CONFIRM_IMAGES', to: 'PREVIOUS' }, // Return to originating state

  // Front desk connection
  { from: 'S-G-008', trigger: 'CONTACT_FRONT_DESK', to: 'S-G-009' },
  { from: 'S-G-009', trigger: 'CANCEL_CONNECTION', to: 'S-G-008' },

  // Agent routing (after 8s countdown)
  { from: 'S-G-009', condition: 'human_agent_available=true', to: 'S-G-003', context: 'FRONT_DESK_AGENT' },
  { from: 'S-G-009', condition: 'human_agent_available=false && ai_agent_available=true && is_paid_user=true', to: 'S-G-003', context: 'AI_AGENT' },
  { from: 'S-G-009', condition: 'ai_agent_available=false || is_paid_user=false', to: 'S-G-011', context: 'BOT' },

  // Deferred state
  { from: 'S-G-011', trigger: 'CONTINUE', to: 'S-G-003' },
];

// States where recording should be preserved during navigation
export const RECORDING_PRESERVE_STATES: StateId[] = ['S-G-005', 'S-G-006'];

// States that can be entered from swipe gestures
export const SWIPE_NAVIGABLE_STATES: StateId[] = [
  'S-G-003', 'S-G-004', 'S-G-005', 'S-G-006', 'S-G-008',
];

// Maximum recording duration in seconds
export const MAX_RECORDING_DURATION = 300; // 5 minutes

// Connection countdown duration in seconds
export const CONNECTION_COUNTDOWN = 8;

// Get state by ID
export function getState(id: StateId): StateDefinition {
  return STATES[id];
}

// Get applicable transitions for a state
export function getTransitionsFrom(stateId: StateId): Transition[] {
  return TRANSITIONS.filter(
    (t) => t.from === stateId || t.from === '*'
  );
}

// Check if a transition is valid
export function isValidTransition(
  currentState: StateId,
  trigger: Trigger,
  context: {
    hasSeenWelcome: boolean;
    humanAgentAvailable: boolean;
    aiAgentAvailable: boolean;
    isPaidUser: boolean;
  }
): Transition | null {
  const transitions = getTransitionsFrom(currentState);
  
  for (const transition of transitions) {
    if (transition.trigger === trigger) {
      // Check conditions if any
      if (transition.condition) {
        const conditionMet = evaluateCondition(transition.condition, context);
        if (conditionMet) {
          return transition;
        }
      } else {
        return transition;
      }
    }
  }
  
  return null;
}

// Evaluate condition string
function evaluateCondition(
  condition: string,
  context: {
    hasSeenWelcome: boolean;
    humanAgentAvailable: boolean;
    aiAgentAvailable: boolean;
    isPaidUser: boolean;
  }
): boolean {
  // Parse simple conditions
  const conditions = condition.split('&&').map((c) => c.trim());
  
  return conditions.every((cond) => {
    if (cond.includes('=')) {
      const [key, value] = cond.split('=').map((s) => s.trim());
      const boolValue = value === 'true';
      
      switch (key) {
        case 'has_seen_welcome':
          return context.hasSeenWelcome === boolValue;
        case 'human_agent_available':
          return context.humanAgentAvailable === boolValue;
        case 'ai_agent_available':
          return context.aiAgentAvailable === boolValue;
        case 'is_paid_user':
          return context.isPaidUser === boolValue;
        default:
          return false;
      }
    }
    return false;
  });
}

// Get entry state based on context
export function getEntryState(hasSeenWelcome: boolean): StateId {
  return hasSeenWelcome ? 'S-G-003' : 'S-G-001';
}
