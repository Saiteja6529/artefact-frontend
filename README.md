# ARTEFACT Frontend

ARTEFACT is a retrieval-augmented mythology assistant designed around classical texts rather than open-ended chat. The frontend is a React application that provides the interaction layer for a scoped RAG system: users select a civilization, choose a source text, ask questions, and receive grounded answers generated from retrieved passages instead of unconstrained model recall.

This README documents the current implementation state in a technical and organized way, including what has already been built, how the system works end to end, and what engineering decisions are visible in the codebase today.

## 1. Current Scope

The project currently implements a domain-specific conversational interface for mythology and literary question answering across a small curated corpus.

Supported scopes in the UI:

- Greek
  - Iliad
  - Odyssey
- Indian
  - Rigveda
  - Ramayana
  - Mahabharata
  - Bhagavad Gita

The frontend does not behave like a generic chatbot. It enforces scope selection before prompting, passes conversation history to the backend, and renders streamed responses progressively so the answer appears as if it is being written in real time.

## 2. What Has Been Built So Far

The current milestone already includes the major moving parts of a usable RAG product, not just a mock UI.

- A React chat interface with session-based conversation handling.
- Civilization and book scoping to constrain retrieval to a selected text.
- A Flask backend that exposes chat and speech endpoints.
- A retrieval pipeline based on FAISS vector search.
- Embedding generation using `sentence-transformers`.
- Grounded response generation using Groq-hosted LLMs.
- Follow-up question rewriting so short ambiguous questions can be resolved using recent chat memory.
- Text-to-speech playback for model responses via Deepgram.
- Token streaming from backend to frontend so answers render incrementally instead of arriving as one buffered block.

## 3. High-Level Architecture

```text
User
  -> React frontend
  -> scoped request { civilization, book, query, history }
  -> Flask API
  -> follow-up normalization and query rewriting
  -> FAISS retrieval over the selected book index
  -> prompt assembly with memory + retrieved passages
  -> Groq chat completion
  -> streamed text chunks back to frontend
  -> incremental rendering in chat UI

Optional voice path:
Model answer
  -> Deepgram TTS
  -> MP3 response
  -> browser audio playback
```

## 4. Frontend Responsibilities

The frontend is implemented in React and acts as the orchestration layer for the user experience.

Primary responsibilities:

- Maintain chat state for the active conversation.
- Maintain a session list and allow switching between prior conversations.
- Force domain selection before a user can submit a prompt.
- Send user queries and normalized history to the backend.
- Consume the streaming endpoint with `fetch(...).body.getReader()`.
- Update the last assistant message as chunks arrive.
- Trigger voice synthesis for completed assistant responses.
- Keep the interaction model lightweight and immediate without requiring page reloads.

Notable frontend behavior already implemented:

- Progressive answer rendering instead of buffered full-paragraph replacement.
- Scroll-to-bottom behavior tied to chat updates.
- Session grouping into `Today`, `Yesterday`, and `Earlier`.
- Voice playback state management, including play/stop and resource cleanup.
- Intro screen and branded shell UI for a more productized experience than a raw prototype.

## 5. Backend Responsibilities

The frontend depends on a Python Flask backend that performs the actual retrieval and generation work.

Current backend endpoints:

- `POST /chat`
  - Returns a classic buffered JSON answer.
- `POST /chat/stream`
  - Streams text chunks progressively for real-time rendering.
- `POST /synthesize`
  - Converts a generated answer into MP3 audio using Deepgram.

The backend currently:

- Loads environment variables from `.env`.
- Imports the RAG pipeline from `backend/scripts/rag_chat.py`.
- Handles CORS for local frontend-backend communication.
- Uses chunked HTTP streaming for live token delivery.

## 6. Retrieval-Augmented Generation Design

The current RAG implementation is more than simple retrieval plus prompting. It already includes several grounding and conversation-control layers.

### 6.1 Query Handling

Incoming chat history is normalized into a consistent internal structure. The backend then checks whether the latest user message looks like a follow-up question, such as:

- short queries
- referential prompts using words like `it`, `that`, `him`
- continuation prompts like `what happened next` or `continue`

If the query is ambiguous, a rewrite step produces a standalone version of the question using only recent conversation memory.

### 6.2 Retrieval Layer

The retrieval system:

- loads precomputed `chunks.jsonl` for the selected book
- loads a matching `faiss.index`
- embeds the retrieval query with `all-MiniLM-L6-v2`
- searches the vector index for the top `k` relevant chunks
- concatenates the retrieved passages into the context block

This means retrieval is book-specific and not global across the entire corpus. That is a useful architectural decision because it reduces noise and keeps generated answers aligned to the selected source.

### 6.3 Prompt Construction

The model prompt is assembled from:

- selected civilization
- selected book
- bounded conversation memory
- standalone interpretation of the latest question
- retrieved book context
- explicit behavioral rules that prioritize evidence and discourage hallucination

The prompt design already reflects a grounded-assistant strategy rather than a plain chatbot prompt.

### 6.4 Generation Layer

Generation is performed through Groq using:

- `GROQ_MODEL` for answer generation
- `GROQ_REWRITE_MODEL` for follow-up rewriting

Current defaults in code:

- chat model: `llama-3.1-8b-instant`
- low temperature generation for tighter factual control

## 7. Streaming Generation

One of the important improvements now present in the stack is token streaming.

Previous behavior:

- the backend waited for the complete model answer
- the frontend received one final JSON payload
- the UI replaced the assistant message all at once

Current behavior:

- the backend calls Groq with `stream=True`
- Flask yields content chunks through `POST /chat/stream`
- the frontend reads the stream with a `ReadableStream` reader
- the last assistant bubble is updated incrementally as text arrives

This is what creates the "AI is writing" effect instead of the older buffered "paragraph dump" effect.

## 8. Voice Synthesis Path

ARTEFACT also includes a speech layer for assistant outputs.

Current implementation:

- frontend sends assistant text to `POST /synthesize`
- backend calls Deepgram TTS using `aura-zeus-en`
- audio bytes are returned as `audio/mpeg`
- frontend creates an object URL and plays the MP3 in the browser

This is a useful product feature because it extends the app beyond text-only retrieval and makes the system feel closer to a multimodal assistant.

## 9. Project Structure

```text
artifact/
  backend/
    app.py
    requirements.txt
    README.md
    check_route.py
    test_voice.py
    scripts/
      clean_all_books.py
      chunk_all_books.py
      embed_book.py
      rag_chat.py
      search_book.py
  frontend/
    public/
      index.html
      favicon.ico
      logo assets
    src/
      App.js
      App.css
      index.js
      index.css
      test files
    package.json
    README.md
```

## 10. Preprocessing Pipeline

The repository already suggests a standard document-ingestion workflow for building searchable indexes.

Pipeline stages:

1. `clean_all_books.py`
   - normalizes or prepares raw book text
2. `chunk_all_books.py`
   - splits content into retrieval units
3. `embed_book.py`
   - computes vector embeddings
4. FAISS index creation
   - stores vectors for nearest-neighbor retrieval
5. `search_book.py`
   - supports retrieval inspection or debugging
6. `rag_chat.py`
   - performs live inference with retrieval

This separation is good engineering practice because preprocessing and inference are not tightly coupled.

## 11. API Contracts

### 11.1 Buffered Chat

`POST /chat`

Request:

```json
{
  "query": "Who is Achilles?",
  "category": "greek",
  "book": "iliad",
  "history": []
}
```

Response:

```json
{
  "answer": "Achilles is ..."
}
```

### 11.2 Streaming Chat

`POST /chat/stream`

Request body matches `/chat`, but the response is streamed as plain text chunks instead of returned as a final JSON document.

### 11.3 Voice Synthesis

`POST /synthesize`

Request:

```json
{
  "text": "Sing, goddess, the rage of Achilles..."
}
```

Response:

- binary MP3 payload

## 12. Technology Stack

Frontend:

- React 19
- JavaScript
- CSS
- Axios for binary voice requests
- native `fetch` stream handling for incremental text generation

Backend:

- Python
- Flask
- FAISS
- Sentence Transformers
- Groq Python SDK
- python-dotenv
- Deepgram SDK

## 13. Local Development

### Frontend

```bash
cd frontend
npm install
npm start
```

Default development server:

```text
http://localhost:3000
```

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Note:

- The current backend source also imports `faiss` and `deepgram`.
- If `backend/requirements.txt` has not yet been updated in your local copy, install the missing runtime packages manually before starting the server.

Default backend server:

```text
http://127.0.0.1:5000
```

## 14. Required Environment Variables

At minimum, the backend expects:

```env
GROQ_API_KEY=your_groq_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
```

Optional runtime tuning:

```env
GROQ_MODEL=llama-3.1-8b-instant
GROQ_REWRITE_MODEL=llama-3.1-8b-instant
ARTEFACT_MAX_HISTORY_MESSAGES=12
ARTEFACT_MAX_HISTORY_CHARS=9000
ARTEFACT_MAX_CONTEXT_CHARS=14000
ARTEFACT_RETRIEVAL_K=5
```

## 15. Engineering Characteristics of the Current Build

What is strong in the current implementation:

- clear separation between UI, API, retrieval, and model orchestration
- book-scoped retrieval reduces irrelevant context
- follow-up rewriting improves multi-turn usability
- prompt rules explicitly push the model toward grounded answers
- streaming improves perceived responsiveness
- voice synthesis adds a differentiated interaction layer

What is still prototype-level:

- there is no persistence layer for sessions beyond client memory
- no authentication or multi-user support exists yet
- no formal observability, tracing, or metrics pipeline is present
- no citation rendering is shown in the frontend yet
- no retry, rate-limit handling, or backpressure controls are exposed in the UI

## 16. Recommended Next Steps

Logical next upgrades for this project would be:

- add source citations per answer chunk or per final response
- persist sessions in a database instead of in-memory React state
- add retrieval diagnostics for debugging bad answers
- introduce structured evaluation for grounding quality
- separate ingestion tooling from runtime services more explicitly
- add production-safe streaming infrastructure behind a reverse proxy
- implement test coverage for chat flows, retrieval correctness, and API behavior

## 17. Summary

ARTEFACT is already past the stage of a simple chatbot demo. The current system combines scoped retrieval, follow-up-aware query rewriting, vector search, grounded prompt construction, Groq-based generation, streaming UI updates, and optional voice playback into a coherent mythology-focused assistant.

From an engineering perspective, the main achievement so far is that the project now behaves like a real RAG application rather than a static frontend attached to a single LLM call.
