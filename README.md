# DocuMind backend

Backend for DocuMind's IT document-to-learning flow. The active topic catalog focuses on programming, software engineering, databases, networks, cybersecurity, AI/ML, cloud/DevOps, operating systems and related IT fields. It supports authenticated and guest sessions, multi-file/pasted input, review before processing, chunked LLM generation, validated dynamic JSON results, quizzes, follow-up chat and exports.

## Setup

1. Copy .env.example to .env.local and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon key), and the server-only `SUPABASE_SERVICE_ROLE_KEY`.
2. Apply all SQL files in supabase/migrations in filename order. Seeds include topics, validation rules and versioned prompt templates; private buckets are created by the first migration.
3. In Supabase Auth URL Configuration, set the Site URL to the deployed origin and allow `http://localhost:3000/auth/callback` plus `https://docu-mind-hackrathon.vercel.app/auth/callback` as redirect URLs for email verification.
4. Run npm install, then npm run dev.
5. LLM_PROVIDER=mock is the default and exercises the complete flow without keys. Set LLM_PROVIDER=gemini and add GEMINI_API_KEY to enable Gemini.

Never expose SUPABASE_SERVICE_ROLE_KEY or GEMINI_API_KEY in client-side code.

## Flow

POST /api/analyses creates a guest or owned analysis. Submit text or multipart files, then POST /api/analyses/:id/validate; inspect and optionally edit the extracted source and outline with PATCH /api/analyses/:id/review; explicitly confirm with POST /api/analyses/:id/confirm; process with POST /api/analyses/:id/run; fetch status/result; then use quiz, chat and export endpoints.

An analysis is not sent to an LLM before confirmation. Each chunk is persisted, generated output is parsed and schema-checked, and malformed model output gets one repair attempt. Structured blocks use `contentType` (`json`, `table`, `latex`, `mermaid`, `plantuml`, or `code`) so the frontend can render data, formulas, diagrams, tables, and source without treating arbitrary objects as visible JSON. A failed chunk leaves an actionable error and can be retried via /run.

When quiz generation returns an incomplete or differently wrapped response, the backend normalizes supported shapes and creates source-grounded true/false questions for any remaining slots. A temporary quiz LLM error does not silently result in a completed analysis with an empty quiz.

The result workspace has separate overview, summary, detailed analysis, interactive quiz, contextual chat, and report export views. Reports can be downloaded as PDF, Word (`.docx`), Markdown, HTML, or JSON. JSON is an explicitly labelled machine-readable export; it is never rendered as ordinary prose.

## API routes

- GET /api/health, GET /api/topics
- GET /api/prompts
- GET/PATCH /api/profile (authenticated)
- POST /api/analyses, GET /api/analyses
- GET /api/analyses/:id, POST /validate, PATCH /review, POST /confirm, POST /run, GET /result
- GET /api/analyses/:id/quiz, POST /quiz/attempts
- GET/POST /api/analyses/:id/chat
- POST /api/analyses/:id/exports (`pdf`, `docx`, `markdown`, `html`, `json`)

Guest requests receive an HttpOnly dm_guest cookie. Guest data stops being accessible at its expiry time; the scheduled cleanup then removes expired rows and stored files. Configure CRON_SECRET in the hosting environment for cleanup. Authenticated history is scoped by Supabase Auth user ID. Public clients cannot modify analysis state or read quiz answers directly.

Users can sign up with email/password, verify email through `/auth/callback`, sign in, edit their display name and username, and sign out locally. Active guest analyses keep using their guest cookie if a user signs in before finishing; new analyses created while signed in are owned by the account.

After confirmation, topic routing uses specialized IT prompts when the source supports an IT classification. Documents outside IT or without enough evidence use global fallback prompts for analysis, quizzes, chat, and JSON repair. These prompts stay grounded in the source and avoid claiming the same depth as IT-specific prompts. Results record `metadata.promptScope` as `it_specialized` or `general_fallback` and include the detected topic label.

## Request example

Create a guest analysis with pasted text:

```sh
curl -i -c cookies.txt -X POST http://localhost:3000/api/analyses \
  -H 'content-type: application/json' \
  -d '{"title":"Cơ sở dữ liệu","topicCode":"IT","quizEnabled":true,"text":"Nội dung tài liệu dài ít nhất 40 ký tự..."}'
```

Keep the returned analysis ID, then send the same cookie jar through validate, review, confirm and run. For signed-in users, send the Supabase access token as an Authorization Bearer token. The browser requests short-lived signed upload URLs from the API, uploads files directly to the private `analysis-inputs` bucket, and then calls the ingest route. This avoids sending large files through Vercel Functions. Each file is capped at `MAX_UPLOAD_MB` (default 20 MB); visual OCR inputs are capped at `MAX_VISION_MB` (default 8 MB).

Supported inputs include PDF, DOCX, TXT, Markdown, JSON, common IT source-code formats, PNG, JPG, and JPEG. Text-layer PDFs and DOCX files are parsed locally. Scanned PDFs and raster images use Gemini Vision. DOCX OCR inspects up to three embedded PNG/JPEG images. The review screen shows an image preview and editable extracted text so users can correct OCR before confirming analysis.

LaTeX formulas render with KaTeX. Mermaid diagrams render in the result view with strict security settings and are stored as private SVG assets. HTML exports embed the saved SVG, while PDF and Word exports embed PNG renderings if the result view has persisted them; otherwise the structured data retains the diagram source. Apply `20260929051348_documind_visual_assets.sql` to create the private `analysis-assets` bucket. The browser only receives short-lived signed asset/upload URLs; server-only Supabase credentials remain on the server.

## Data model

The schema has 16 application tables. Inputs and chunks are separately stored for per-file review/retry; results use versioned JSON with dynamic sections and typed blocks. Quiz candidates are generated from chunks, deduplicated, and stored with answer keys that are available only to the server scoring route. Versioned prompts cover IT-specific work and a general fallback for documents outside IT or with an unclear topic; programming, database and cybersecurity have tailored analysis prompts.

## Tests

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
