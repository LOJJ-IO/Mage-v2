Here is the updated `README.md` file with the setup instructions added in a new **Getting Started** section just before the API Endpoints.

```markdown
# Mage: Hotel Guest Communication Interface

Mage is a mobile-first web application designed to streamline hotel guest requests, automate routine inquiries, and facilitate seamless handoffs to human staff. Built with a Next.js frontend and a FastAPI backend, it provides a highly deterministic, state-driven chat interface.

![Mage Interface](https://via.placeholder.com/800x400?text=Mage+Hotel+Interface)

## What Problem It Solves

Hotel front desks frequently experience bottlenecks due to high volumes of routine inquiries (e.g., WiFi passwords, check-out times, amenity hours) and minor service requests (e.g., extra towels, room service). 

Mage solves this by acting as the first layer of guest interaction:
1. **Deflection of Routine Queries:** Instantly answers common questions using a deterministic intent layer and a scoped knowledge base.
2. **Automated Ticketing:** Parses service requests (maintenance, housekeeping) and automatically generates tickets in the hotel's property management system.
3. **Frictionless Escalation:** Transitions guests to a human front-desk agent when requests fall outside the automated scope or when specifically requested.

## Architecture

The system is split between a strictly typed React frontend and a Python backend handling routing, transcription, and database operations.

```text
+-------------------+        HTTP / REST        +-----------------------+
|                   | ------------------------> |                       |
|  Guest Device     |                           |  FastAPI Backend      | ---> [ OpenRouter / LLMs ]
|  (Next.js / PWA)  | <------------------------ |                       |
|                   |        Server-Sent Events +-------+-------+-------+
+-------------------+        (Streaming text)           |       |
         |                                              |       |
         | WebSockets (Agent Availability)              v       v
         +--------------------------------> [ Supabase ]     [ Whisper Transcription ]
                                            (Tickets/Auth)   (Audio Processing)

```

## Tech Stack

**Frontend**

* **Framework:** Next.js / React
* **State Management:** Zustand (Application State) & React Query (Server State)
* **Styling & Animation:** Tailwind CSS & Framer Motion
* **Audio:** Native Web Audio API (MediaRecorder)

**Backend**

* **Framework:** FastAPI (Python)
* **Data Layer:** Supabase (PostgreSQL) / Internal Mock Database for dev
* **Inference Routing:** OpenRouter API
* **Audio Processing:** Whisper (Local or API-driven transcription)

## How It Works

### 1. Frontend State Machine

To prevent UI desync and race conditions, the frontend operates on a strict 11-state machine. The application can only exist in one of these predefined states (e.g., `Idle`, `Typing`, `Recording`, `Transcribing`, `Connection`). State transitions are triggered by explicit user actions or backend events.

### 2. Request Routing & Intent Parsing

When a message is sent to the backend, it passes through a multi-layered filter:

* **Deterministic Layer:** A Python regex/intent layer intercepts common keywords ("WiFi", "Check out") for zero-latency, hardcoded responses.
* **Triage Layer (Small Model):** A fast LLM determines if the query is relevant to the hotel. It can trigger backend functions (e.g., fetch weather, lookup guest name/room) or format the response for a ticket action (`ACTION: HOUSEKEEPING`).
* **Complex Layer (Large Model):** If the small model flags the request as relevant but too complex (`HANDOFF`), a heavier model processes the request.

### 3. Non-Prompting Tools & Context Injection

The backend intercepts specific action flags from the triage model (like `GET_WEATHER` or `GET_GUEST_INFO`) and injects real-time data from external APIs or the database directly into the response stream before the user sees it.

### 4. Agent Handoff

If the system determines human intervention is required, the frontend enters the `Connection` state. An 8-second countdown allows the guest to cancel. Once complete, the system checks WebSocket availability for human agents. If available, the chat transitions to a live queue; if not, it creates a deferred support ticket.

## Getting Started

### Prerequisites

* Node.js 18+
* Python 3.11+
* npm or yarn

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev

```

The frontend will be available at `http://localhost:3000`

### Backend Setup
Backend takes 15 mins to start due the whisper translation model downloading for the first time.
```bash
cd backend

# Create virtual environment (optional)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Start server
uvicorn app.main:app --reload --port 8000

```

## API Endpoints

**Chat & Processing**

* `POST /api/chat/message` - Standard synchronous message processing.
* `POST /api/chat/stream` - SSE endpoint for streaming token responses.
* `POST /api/transcribe` - Accepts audio blobs and returns transcribed text.

**Ticketing & Operations**

* `POST /api/tickets` - Generate a new staff ticket.
* `PATCH /api/tickets/{id}` - Update ticket status or assignment.
* `GET /api/guests/{id}` - Retrieve guest profile and membership data.
* `GET /api/agents/availability` - Poll for current live-agent capacity.

## Screenshots

*(Replace the placeholder URLs with actual paths to your repository images)*

| Chat Interface | Voice Recording | Profile & Tickets |
| --- | --- | --- |
|  |  |  |
|  | *Hold-to-record with swipe-to-lock mechanics.* | *Guest dashboard and active tickets.* |

## Design System

The application utilizes an Uber-inspired, high-contrast design system optimized for mobile readability and fast touch interactions.

* **Primary:** Black `#000000` / White `#FFFFFF`
* **Accent:** Blue `#276EF1`
* **Status:** Green `#05944F` (Success), Red `#E11900` (Error), Yellow `#FFC043` (Warning)
* **Typography:** Clash Display (200-700 weights)
* **Geometry:** 8px base border radius (sm), 24px extreme radius (uber-xl)


