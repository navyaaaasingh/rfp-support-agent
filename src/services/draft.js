import { retrieveChunks } from './retrieve.js';
import { generateDraft } from './gemini.js';

/**
 * Full pipeline for one inbound question: retrieve relevant chunks,
 * then ask the LLM to draft a grounded, cited answer.
 */
export async function answerQuestion(question, k = 6) {
  const chunks = await retrieveChunks(question, k);
  const draft = await generateDraft(question, chunks);

  // Map the model's numeric source references back to actual chunk metadata
  // so the UI can show real doc names, not just "[Source 2]".
  const resolvedSources = (draft.sources || [])
    .map((n) => chunks[n - 1])
    .filter(Boolean)
    .map((c) => ({
      source_doc: c.source_doc,
      section_title: c.section_title,
      similarity: Number(c.similarity?.toFixed?.(3) ?? c.similarity),
    }));

  return {
    question,
    draft_answer: draft.draft_answer,
    confidence: draft.confidence,
    sources: resolvedSources,
    retrieved_count: chunks.length,
  };
}
