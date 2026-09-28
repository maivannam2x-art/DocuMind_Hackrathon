# DocuMind backend

Backend for DocuMind's IT document-to-learning flow. The active topic catalog focuses on programming, software engineering, databases, networks, cybersecurity, AI/ML, cloud/DevOps, operating systems and related IT fields. It supports authenticated and guest sessions, multi-file/pasted input, review before processing, chunked LLM generation, validated dynamic JSON results, quizzes, follow-up chat and exports.

## Setup

1. Copy .env.example to .env.local and fill the Supabase URL, anon key and server-only service-role key.
2. Apply all SQL files in supabase/migrations in filename order. Seeds include topics, validation rules and versioned prompt templates; private buckets are created by the first migration.
3. Run npm install, then npm run dev.
4. LLM_PROVIDER=mock is the default and exercises the complete flow without keys. Set LLM_PROVIDER=gemini and add GEMINI_API_KEY to enable Gemini.

Never expose SUPABASE_SERVICE_ROLE_KEY or GEMINI_API_KEY in client-side code.

## Flow

POST /api/analyses creates a guest or owned analysis. Submit text or multipart files, then POST /api/analyses/:id/validate; inspect and optionally edit the extracted source and outline with PATCH /api/analyses/:id/review; explicitly confirm with POST /api/analyses/:id/confirm; process with POST /api/analyses/:id/run; fetch status/result; then use quiz, chat and export endpoints.

An analysis is not sent to an LLM before confirmation. Each chunk is persisted, generated output is parsed and schema-checked, and malformed model output gets one repair attempt. A failed chunk leaves an actionable error and can be retried via /run.

## API routes

- GET /api/health, GET /api/topics
- GET /api/prompts
- POST /api/analyses, GET /api/analyses
- GET /api/analyses/:id, POST /validate, PATCH /review, POST /confirm, POST /run, GET /result
- GET /api/analyses/:id/quiz, POST /quiz/attempts
- POST /api/analyses/:id/chat
- POST /api/analyses/:id/exports

Guest requests receive an HttpOnly dm_guest cookie. Guest data stops being accessible at its expiry time; the scheduled cleanup then removes expired rows and stored files. Configure CRON_SECRET in the hosting environment for cleanup. Authenticated history is scoped by Supabase Auth user ID. Public clients cannot modify analysis state or read quiz answers directly.

## Request example

Create a guest analysis with pasted text:

```sh
curl -i -c cookies.txt -X POST http://localhost:3000/api/analyses \
  -H 'content-type: application/json' \
  -d '{"title":"Cơ sở dữ liệu","topicCode":"IT","quizEnabled":true,"text":"Nội dung tài liệu dài ít nhất 40 ký tự..."}'
```

Keep the returned analysis ID, then send the same cookie jar through validate, review, confirm and run. For signed-in users, send the Supabase access token as an Authorization Bearer token. File uploads use multipart form data with one or more files fields; accepted formats are PDF, DOCX and TXT.

## Data model

The schema has 16 application tables. Inputs and chunks are separately stored for per-file review/retry; results use versioned JSON with dynamic sections and typed blocks. Quiz candidates are generated from chunks, deduplicated, and stored with answer keys that are available only to the server scoring route. Prompts are versioned for technical-document explanation, quiz generation, grounded follow-up chat, JSON repair and IT-specialization detection; programming, database and cybersecurity have tailored analysis prompts.

## Tests

Run npm test, npm run typecheck, and npm run build.
