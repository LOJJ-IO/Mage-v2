# Mage - AI-Powered Hotel Communication Interface

A mobile-first, AI-powered hotel communication interface built with Next.js (frontend) and FastAPI (backend). Features a sophisticated state machine for guest interactions, voice recording, and intelligent agent routing.

![Mage](https://via.placeholder.com/800x400?text=Mage+Hotel+Assistant)

## Features

### State Machine Architecture

The app follows a precisely defined state machine with 11 states:

| State ID | Name | Description |
| --- | --- | --- |
| S-G-001 | Loading | Initial branded loading and session setup |
| S-G-002 | Initial | First-time chat entry per booking |
| S-G-003 | Idle | Resting chat view with no active input |
| S-G-004 | Typing | Keyboard-focused editable text input |
| S-G-005 | Recording | Active hold-to-record voice input |
| S-G-006 | LockedRecording | Hands-free locked voice recording |
| S-G-007 | Transcribing | Audio-to-text processing |
| S-G-008 | Profile | Guest profile and service actions |
| S-G-009 | Connection | Ticket creation & agent routing (8s countdown) |
| S-G-010 | ImageSelect | Image selection & confirmation |
| S-G-011 | Deferred | No-agent explanation & issue capture |

### Key Features

- 🎙️ **Voice Recording**: Hold-to-record with swipe-to-lock functionality
- 💬 **AI Chat**: Powered by Gemini 2.0 Flash via OpenRouter
- 👤 **Agent Routing**: Smart routing between AI and human agents
- 📱 **Mobile-First**: Uber-inspired design with Clash Display font
- 🔔 **Toast Notifications**: Non-stacking, inline error handling
- 📸 **Image Attachments**: Multi-image upload support
- 🎫 **Ticket System**: Issue tracking with deferred support

## Tech Stack

### Frontend

- **Framework**: Next.js 14 (App Router)
- **State Management**: Zustand + TanStack Query
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Font**: Clash Display

### Backend

- **Framework**: FastAPI
- **Database**: Supabase (PostgreSQL) - mocked for MVP
- **AI/LLM**: Gemini 2.0 Flash Experimental via OpenRouter
- **Rate Limiting**: Custom sliding window implementation

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- npm or yarn

### Frontend Setup

```bash
cd mage-frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Backend Setup

```bash
cd mage-backend

# Create virtual environment (optional)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Start server
uvicorn app.main:app --reload
```

The backend API will be available at `http://localhost:8000`

- Swagger docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Environment Variables

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend (.env)

```env
# Supabase (optional - mocked for MVP)
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# OpenRouter API Key for Gemini
OPENROUTER_API_KEY=your_openrouter_key

# Rate Limiting
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW=60
```

## Project Structure

```text
mage/
├── mage-frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   ├── components/       # React components
│   │   │   ├── screens/      # State-specific screens
│   │   │   └── providers/    # Context providers
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Utilities and state machine
│   │   ├── store/            # Zustand store
│   │   ├── styles/           # Global styles
│   │   └── types/            # TypeScript types
│   └── public/               # Static assets
│
└── mage-backend/
    ├── app/
    │   ├── api/              # FastAPI routers
    │   ├── core/             # Config and utilities
    │   ├── models/           # Pydantic schemas
    │   └── services/         # Business logic
    └── tests/                # Test files
```

## State Machine Navigation

### Swipe Gestures

- **Swipe Left (RTL)**: Navigate to Profile from any chat state
- **Swipe Right (LTR)**: Go back to previous state
- **Swipe Up**: Lock recording in Recording state
- **Swipe Down**: Unlock recording in LockedRecording state

### Recording Behavior

- Recording is **preserved** when navigating to Profile via swipe
- A toast notification indicates recording is still active
- 5-minute maximum recording duration

### Agent Connection

- 8-second countdown before ticket creation
- Cancel button available during countdown
- Routing priority:

  1. Human agent (if available)
  2. AI agent (if available and user is paid)
  3. Deferred screen (capture issue for later)

## API Endpoints

### Chat

- `POST /api/chat/message` - Send message, get response
- `POST /api/chat/stream` - Stream response (SSE)

### Transcription

- `POST /api/transcribe` - Transcribe audio to text

### Tickets

- `POST /api/tickets` - Create new ticket
- `PATCH /api/tickets/{id}` - Update ticket
- `POST /api/tickets/{id}/resolve` - Resolve ticket
- `POST /api/tickets/{id}/cancel` - Cancel ticket

### Guests

- `GET /api/guests/{id}` - Get guest profile
- `GET /api/guests/booking/{id}` - Get guest by booking

### Agents

- `GET /api/agents/availability` - Check agent availability

## Design System

### Colors (Uber-inspired)

- **Black**: #000000 (Primary)
- **White**: #FFFFFF
- **Blue**: #276EF1 (Accent)
- **Green**: #05944F (Success)
- **Red**: #E11900 (Error)
- **Yellow**: #FFC043 (Warning)

### Typography

- **Font**: Clash Display (200-700 weights)
- **Source**: Fontshare API

### Spacing & Radius

- Border radius: 8px (sm), 16px (md), 24px (lg), 100px (full)
- Standard padding: 16px, 24px

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - See LICENSE file for details
