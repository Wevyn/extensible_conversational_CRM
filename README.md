### Extensible Conversational CRM

Voice-driven interface for updating Attio CRM using in-browser speech recognition and an AI parser. Stop recording to push structured updates (people, companies, deals, tasks, relationships) into Attio.

### Quick start (current state)

- Node 18+ recommended
- Install and run:
  - `npm install`
  - `npm start`

Notes:

- The app is create-react-app based and runs on `http://localhost:3000`.
- Saying the trigger phrase "initiate CRM" during recording starts capturing CRM-relevant content. Stopping the recording sends the captured text to the AI parser and then to Attio.

### Critical security notice

- Secrets are currently hard-coded in client-side code and therefore exposed to anyone with access to this repo or the running app:
  - Attio API Bearer token in `src/advanced-attio.js` and `src/attio.js`
  - Groq/OpenRouter API keys in `src/advanced-parser.js` and `src/oldadvanced-attio.js`
- ACTION REQUIRED:
  - Revoke/rotate all exposed keys immediately.
  - Move all API calls to a backend proxy and load secrets via environment variables on the server.

### What’s implemented today

- In-browser speech recognition with live transcript UI and a "lyrics"-style display (`src/App.js`, `src/speech-recorder.css`).
- AI parsing pipeline that extracts structured objects (people, deals, tasks, companies, relationships) from conversation text (`src/advanced-parser.js`).
- Attio integration that upserts entities with enhanced logic, mappings, and linking (`src/advanced-attio.js`).
- Attribute and stage metadata loading from Attio with local caching and fallbacks (`src/advanced-attio.js`).
- Conversation context tracking to provide better parsing hints across turns (`src/advanced-parser.js`).

### Current file map (high-level)

- `src/App.js`: Main UI component (recording, trigger phrase, processing, and stats)
- `src/advanced-parser.js`: AI prompt + response cleaning and enrichment; conversation context helper
- `src/advanced-attio.js`: Attio client (people, companies, deals, tasks, relationships) + attribute/stage helpers
- `src/attio.js`: Older/simpler Attio client (not used by `App.js`)
- `src/oldadvanced-attio.js`: Older speech recorder + OpenRouter direct call (legacy)
- `src/index.js`, `src/index.css`: CRA bootstrap and base styles
- `src/speech-recorder.css`: UI styles

### Key issues and tech debt

- Client-side secrets: Attio and AI provider keys are in the frontend code.
- Duplicate/legacy modules:
  - Two Attio integrations: `advanced-attio.js` (used) and `attio.js` (older)
  - Legacy recorder/AI flow in `oldadvanced-attio.js`
- Inconsistent stage mapping logic across two versions of advanced Attio files. The app imports `./advanced-attio.js` that includes expanded stage normalization; another similarly named file exists with different stage semantics.
- No backend: All 3rd-party APIs are called from the browser.
- No environment variable management or `.env.example`.
- No tests and limited error/UI states for API failures.

### Recommended architecture (near-term)

1. Introduce a minimal Node/Express server (`server/`) with routes:
   - `POST /api/parse` → proxies to Groq/OpenRouter using server-side keys
   - `POST /api/attio/*` → proxies Attio operations (people, deals, tasks, relationships)
2. Store secrets in server-side `.env` (never expose to the browser).
3. Frontend calls only your backend, never 3rd-party APIs directly.
4. Extract and modularize:
   - `src/lib/ai/` for parser client and response utilities
   - `src/lib/attio/` for client, entity upserts, attribute/stage metadata, helpers
   - `src/features/recorder/` for UI and hooks
5. Create a shared types/schema module for parsed objects; validate AI output before sending to Attio.

### Suggested module breakdown

- `src/lib/attio/client.js`: fetch wrapper; auth from backend; error handling
- `src/lib/attio/attributes.js`: attribute and stage discovery + caches
- `src/lib/attio/people.js`, `companies.js`, `deals.js`, `tasks.js`, `relationships.js`: upsert/update/link functions
- `src/lib/ai/parserClient.js`: calls your backend `/api/parse`
- `src/lib/ai/normalize.js`: JSON extraction, stage mapping, enrichment, validation
- `src/features/recorder/Recorder.jsx` + `useSpeechRecognition.js` + `styles.css`

### Usage (current UI)

1. Click the mic button to start recording.
2. Say: "initiate CRM" to begin capturing CRM-relevant content.
3. Click again to stop; the captured text is parsed and pushed to Attio.
4. Basic processing status and stats show in the UI.

### Roadmap / tasks

- Security
  - [ ] Revoke and rotate all Attio, Groq, and OpenRouter keys currently in the repo
  - [ ] Add backend proxy with `.env` for secrets and CORS
  - [ ] Remove secrets from frontend; reference only backend endpoints
- Architecture & modularization
  - [ ] Create `server/` with `POST /api/parse` and `POST /api/attio/*`
  - [ ] Refactor Attio code into `src/lib/attio/*` modules
  - [ ] Refactor AI parser into `src/lib/ai/*` with schema validation
  - [ ] Consolidate to a single `advanced-attio` implementation; delete/rename legacy files
  - [ ] Add `.env.example` and document required variables
- Data correctness
  - [ ] Unify stage mapping against live Attio options; remove mismatched duplicates
  - [ ] Stronger entity resolution (email-first, then fuzzy name)
  - [ ] Append-notes strategy with clear separators and timestamps
- UI/UX
  - [ ] Status toasts for parse/Attio errors
  - [ ] Display last analysis summary and created records
  - [ ] Configurable trigger phrase in settings
- DevEx & quality
  - [ ] Prettier + ESLint + TypeScript (gradual)
  - [ ] Unit tests for parsers/mappers; integration tests for API routes
  - [ ] GitHub Actions workflow (lint, test, build)

### Environment variables (to add with backend)

Create `server/.env`:

- `ATTIO_API_KEY=...`
- `GROQ_API_KEY=...`
- `OPENROUTER_API_KEY=...`

Frontend `.env` (no secrets):

- `REACT_APP_API_BASE=http://localhost:3001` (or your deployed backend URL)

Important things: 
1. Main files are CRMConnector.js and App.js (also have index.css, index.js)

