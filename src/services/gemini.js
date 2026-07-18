import 'dotenv/config';

const API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
const GENERATION_MODEL = process.env.GENERATION_MODEL || 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

if (!API_KEY) {
  console.warn('[gemini] GEMINI_API_KEY is not set — API calls will fail.');
}

/**
 * Embed a single string of text. Returns a plain array of floats.
 * Docs: https://ai.google.dev/gemini-api/docs/embeddings
 */
export async function embedText(text) {
  const res = await fetch(
    `${BASE_URL}/models/${EMBEDDING_MODEL}:embedContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[gemini] embedText failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

/**
 * Embed many chunks with a small concurrency limit so we stay well under
 * the free-tier requests-per-minute cap during bulk ingestion.
 */
export async function embedBatch(texts, concurrency = 3) {
  const results = new Array(texts.length);
  let next = 0;

  async function worker() {
    while (next < texts.length) {
      const i = next++;
      results[i] = await embedText(texts[i]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/**
 * Ask Gemini to draft an answer grounded in the given retrieved chunks.
 * Returns { draft_answer, sources, confidence }.
 */
export async function generateDraft(question, retrievedChunks) {
  const context = retrievedChunks
    .map(
      (c, i) =>
        `[Source ${i + 1}] (${c.source_type} — ${c.source_doc}${
          c.section_title ? ` — ${c.section_title}` : ''
        })\n${c.content}`
    )
    .join('\n\n');

  const avgSimilarity =
    retrievedChunks.reduce((sum, c) => sum + (c.similarity ?? 0), 0) /
    (retrievedChunks.length || 1);

  const prompt = `You are drafting a response to an incoming sales RFP or technical support question, using only the context below (past RFP answers, manuals, and FAQs). This draft will be reviewed by a human before it is sent, so be accurate and cite your sources — never invent information that isn't in the context.

CONTEXT:
${context || '(no relevant context found)'}

QUESTION:
${question}

Respond with ONLY a JSON object, no markdown fences, no extra text, in this exact shape:
{
  "draft_answer": "the drafted response, written naturally and ready to send",
  "sources": [1, 2],
  "confidence": "high" or "low"
}
"sources" should list the [Source N] numbers actually used. Use "confidence": "low" if the context doesn't clearly answer the question.`;

  const res = await fetch(
    `${BASE_URL}/models/${GENERATION_MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[gemini] generateDraft failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let parsed;
  try {
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Fall back to a safe shape if the model didn't return clean JSON —
    // surfacing the raw text is better than crashing the request.
    parsed = {
      draft_answer: rawText || '(no response generated)',
      sources: [],
      confidence: 'low',
    };
  }

  // If retrieval was weak, override the model's own confidence claim —
  // don't let a fluent-sounding draft mask thin source material.
  if (avgSimilarity < 0.55) parsed.confidence = 'low';

  return parsed;
}
