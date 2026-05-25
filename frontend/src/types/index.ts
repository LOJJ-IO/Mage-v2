// State IDs as defined in the PRD
export type StateId =
  | 'S-G-001' // Guest.Chat.Onboarding.Loading
  | 'S-G-002' // Guest.Chat.Conversation.Initial
  | 'S-G-003' // Guest.Chat.Conversation.Idle
  | 'S-G-004' // Guest.Chat.Conversation.Typing
  | 'S-G-005' // Guest.Chat.Conversation.Recording
  | 'S-G-006' // Guest.Chat.Conversation.LockedRecording
  | 'S-G-007' // Guest.Chat.Conversation.Transcribing
  | 'S-G-008' // Guest.Profile.Viewing.Card
  | 'S-G-009' // Guest.Service.Connection.Loading
  | 'S-G-010' // Guest.Upload.Image.Selecting
  | 'S-G-011'; // Guest.Service.Conversation.Deferred

export type StateName =
  | 'Guest.Chat.Onboarding.Loading'
  | 'Guest.Chat.Conversation.Initial'
  | 'Guest.Chat.Conversation.Idle'
  | 'Guest.Chat.Conversation.Typing'
  | 'Guest.Chat.Conversation.Recording'
  | 'Guest.Chat.Conversation.LockedRecording'
  | 'Guest.Chat.Conversation.Transcribing'
  | 'Guest.Profile.Viewing.Card'
  | 'Guest.Service.Connection.Loading'
  | 'Guest.Upload.Image.Selecting'
  | 'Guest.Service.Conversation.Deferred';

export interface StateDefinition {
  id: StateId;
  name: StateName;
  description: string;
}

// Trigger types for state transitions
export type Trigger =
  | 'SWIPE_RTL_OR_PROFILE'
  | 'BACK'
  | 'SWIPE_LTR'
  | 'LOAD_COMPLETE'
  | 'CONTINUE'
  | 'FOCUS_INPUT'
  | 'DISMISS_KEYBOARD'
  | 'HOLD_MIC'
  | 'SWIPE_UP'
  | 'SWIPE_LEFT'
  | 'RELEASE_HOLD'
  | 'TAP_CANCEL'
  | 'TAP_UNLOCK'
  | 'SWIPE_DOWN'
  | 'TAP_SEND'
  | 'TRANSCRIPTION_SUCCESS'
  | 'TRANSCRIPTION_FAIL'
  | 'UPLOAD'
  | 'CONFIRM_IMAGES'
  | 'CONTACT_FRONT_DESK'
  | 'CANCEL_CONNECTION'
  | 'CONNECTION_TIMEOUT'
  | 'CONNECTION_CALL'
  | 'CONNECTION_CHAT'
  | 'SEND_RECORDING_FROM_PROFILE'
  | 'CANCEL_RECORDING_FROM_PROFILE';

// Conversation context types
export type ConversationContext = 'BOT' | 'FRONT_DESK_AGENT';

// Mic permission states
export type MicPermission = 'granted' | 'denied' | 'prompt';

// Context model from PRD
export interface AppContext {
  conversationContext: ConversationContext;
  hasSeenWelcome: boolean;
  aiAgentAvailable: boolean;
  humanAgentAvailable: boolean;
  micPermission: MicPermission;
  deleteTicket: boolean;
  retainTicket: boolean;
  isPaidUser: boolean;
  agentNotificationPending: boolean;
}

// Transition definition
export interface Transition {
  from: StateId | '*' | 'ENTRY';
  trigger?: Trigger;
  condition?: string;
  to: StateId | 'PREVIOUS';
  context?: ConversationContext;
}

// Message types
export type MessageRole = 'user' | 'assistant' | 'system' | 'staff';
export type MessageKind = 'text' | 'faq';

export interface FaqItem {
  id: string;
  title: string;
  body: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  images?: string[];
  isTyping?: boolean;
  requireContactConfirmation?: boolean;
  kind?: MessageKind;
  intro?: string;
  faqItems?: FaqItem[];
  triggerContent?: string;
  faqResolved?: boolean | null;
}

// Ticket types
export type TicketStatus = 'pending' | 'active' | 'resolved' | 'cancelled';

export interface Ticket {
  id: string;
  guestId: string;
  issue: string;
  status: TicketStatus;
  createdAt: Date;
  resolvedAt?: Date;
  assignedTo?: string;
  assignedType?: ConversationContext;
}

// Guest profile
export interface GuestProfile {
  id: string;
  name: string;
  roomNumber: string;
  checkIn: Date;
  checkOut: Date;
  bookingId: string;
  membershipTier?: string;
  email?: string;
  phone?: string;
}

// Recording state
export interface RecordingState {
  isRecording: boolean;
  isLocked: boolean;
  duration: number;
  audioBlob?: Blob;
}

// Toast notification
export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

// Image attachment
export interface ImageAttachment {
  id: string;
  file: File;
  preview: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ChatResponse {
  message: Message;
  conversationContext: ConversationContext;
}

export interface ChatMessageResponse {
  messages: Message[];
  continueTask?: boolean;
  taskMessage?: string | null;
}

export interface ConversationHistoryResponse {
  messages: Message[];
}

export interface FaqFeedbackRequest {
  guestId: string;
  helpful: boolean;
  triggerContent: string;
  faqTitles?: string[];
  faqMessageId?: string;
}

export interface TranscriptionResponse {
  text: string;
  confidence: number;
}

// State history for PREVIOUS navigation
export interface StateHistoryEntry {
  stateId: StateId;
  context: Partial<AppContext>;
  inputText?: string;
  recording?: RecordingState;
}

// Staff inbox
export type StaffStateId = 'S-S-001' | 'S-S-002' | 'S-S-003';

export type ActionType =
  | 'MAINTENANCE'
  | 'ROOM_SERVICE'
  | 'HOUSEKEEPING'
  | 'CONTACT_FRONT_DESK'
  | 'HANDOFF';

export type StaffActionStatus = 'pending' | 'acknowledged' | 'resolved';

export type StaffActionEscalationType =
  | 'normal'
  | 'escalated'
  | 'status_check'
  | 'repetition'
  | 'contact';

export interface StaffActionConversation {
  action: StaffAction;
  guest: GuestProfile;
  messages: Message[];
}

export interface StaffAction {
  id: string;
  guestId: string;
  actionType: ActionType;
  summary: string;
  sourceMessage: string;
  status: StaffActionStatus;
  createdAt: string;
  guestName?: string;
  roomNumber?: string;
  escalationType?: StaffActionEscalationType;
  allowStaffJumpIn?: boolean;
  guestConversationThreadId?: string;
}
