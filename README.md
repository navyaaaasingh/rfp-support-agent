# Demo Website:https://rfp-support-agent.onrender.com
# RFP & Technical Support Draft Agent

A RAG (Retrieval-Augmented Generation) system that ingests a company's past RFP answers, manuals, and FAQs, then drafts grounded, source-cited answers to new incoming questions for a human to review and send.

Built as a portfolio/college project — see `docs/design.md` (or the design doc shared alongside this repo) for the full architecture writeup, and `eval/` for the retrieval evaluation harness.

## How it works

1. **Ingest** — upload a PDF manual, DOCX, Markdown FAQ, or CSV of past RFP Q&A pairs. Documents are chunked, embedded, and stored in Postgres with `pgvector`.
2. **Ask** — submit a new question (single or bulk via CSV).
3. **Retrieve** — the system embeds the question and finds the most similar chunks via cosine similarity.
4. **Draft** — an LLM drafts an answer grounded in those chunks, citing which source each part came from, and flags low-confidence answers when retrieval is weak.
5. **Review** — a human approves or edits the draft before it goes out. Nothing is auto-sent.

## Stack

- **Backend:** Node.js + Express
- **Vector store:** Postgres + `pgvector` (Supabase or Neon free tier, connected via the transaction pooler — chosen over a local file store because Render's free tier wipes local disk on every redeploy)
- **Embeddings + generation:** Google Gemini API (`gemini-embedding-001` for embeddings, `gemini-flash-latest` for generation — free tier, no credit card required)
- **Frontend:** Plain HTML/CSS/JS review UI
- **Deployed:** live on Render free tier

## Setup

1. **Create the database.** Spin up a free Postgres instance on [Supabase](https://supabase.com) or [Neon](https://neon.tech), then run `db/schema.sql` against it — either via `psql` or by pasting it into Supabase's SQL Editor:
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```
   Use the **transaction pooler** connection string (port `6543`), not the direct connection (port `5432`) — the direct string resolves to an IPv6-only host on some networks and on Render, which fails with `ENETUNREACH`.

2. **Get a Gemini API key** at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free, no card needed).

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # fill in GEMINI_API_KEY and DATABASE_URL
   ```

4. **Install and run:**
   ```bash
   npm install
   npm run dev
   ```
   Visit `http://localhost:3000`.

## API

| Route | Method | Body | Description |
|---|---|---|---|
| `/api/ingest` | POST | multipart: `file`, `sourceType` (`faq`\|`rfp_answer`\|`manual`) | Parse, chunk, embed, and store a document |
| `/api/query` | POST | `{ "question": "..." }` | Retrieve + draft an answer to one question |
| `/api/query/bulk` | POST | `{ "questions": [...] }` or `{ "csv": "question\n..." }` | Draft answers for a batch of questions |
| `/api/health` | GET | — | Health check |

## Evaluation

`eval/run.js` runs a labeled test set (`eval/testset.json`) through the full retrieval + draft pipeline and reports:

- **Retrieval precision@k** — did the expected source document show up in the top-k results?
- **Confidence correlation** — does the system's self-reported confidence line up with retrieval hits/misses?
- **Latency** — end-to-end time per question.

```bash
npm run eval
```

Replace the placeholder entries in `eval/testset.json` with real question/source pairs from your own ingested data before reporting numbers — this is what gives you a genuine "changing X improved retrieval precision from A% to B%" story to talk through.

## Deploying (Render free tier)

- Push this repo to GitHub, create a new Web Service on Render pointing at it.
- Set `GEMINI_API_KEY` and `DATABASE_URL` as environment variables in the Render dashboard (don't commit `.env`).
- Build command: `npm install` · Start command: `npm start`.
- Note: the free web service spins down after inactivity — first request after idle will be slow, and the free Postgres instance may also need a moment to wake up.

## Troubleshooting

Issues actually hit while building and deploying this, kept here since they're likely to recur (especially the Gemini model churn):

- **`ENETUNREACH` connecting to Postgres** — Supabase's direct connection string (port `5432`) resolves to an IPv6-only address, which fails on networks/hosts without outbound IPv6 (including Render). Fix: use the transaction pooler string (port `6543`) instead.
- **`Error: Invalid URL` on `DATABASE_URL`** — usually a leftover `[YOUR-PASSWORD]` placeholder, or an unencoded special character (`@`, `#`, `/`, `:`) in the real password colliding with the URL's own delimiters. Fix: reset to an alphanumeric-only password, or URL-encode the special characters.
- **`expected 768 dimensions, not 3072`** — `gemini-embedding-001` returns 3072-dim vectors by default; the `chunks.embedding` column is defined as `vector(768)`. Fix: pass `outputDimensionality: 768` in the embed request (already done in `src/services/gemini.js`) to match the schema, rather than migrating the column.
- **`404 ... is no longer available to new users`** — Google has been retiring specific Gemini model IDs (e.g. `gemini-2.5-flash`) ahead of their own published deprecation dates, and preview-era names like `gemini-3-flash` don't map directly to the real model ID (`gemini-3-flash-preview`). Fix: use the `gemini-flash-latest` alias, which Google keeps pointed at their current recommended free Flash model, and confirm available model IDs for your account by calling `GET https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY` rather than assuming a name from docs or search results.

## Alternative: splitting providers (Gemini embeddings + Groq generation)

Groq offers a very fast, generous free tier for chat/generation, but doesn't currently expose an embeddings endpoint — so it can't fully replace Gemini here. If Gemini's generation side becomes unreliable again, `generateDraft` in `src/services/gemini.js` can be swapped to call Groq's OpenAI-compatible endpoint while `embedText`/`embedBatch` keep using Gemini. This is a reasonable extension to point to in an interview even if not implemented, since it demonstrates provider-agnostic design.

## Known limitations (V1)

- No auto-send — every draft requires human approval, by design.
- Single knowledge base — no multi-tenant separation.
- No fine-tuning — pure retrieval + prompting.
- Bulk ingestion/querying is sequential to stay under Gemini's free-tier rate limits; expect it to be slow for large batches.
