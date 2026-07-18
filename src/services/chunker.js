/**
 * Chunking strategy:
 * - Q&A source content (FAQ / RFP answer pairs) is already atomic — one
 *   chunk per Q&A pair, no splitting needed.
 * - Free-form docs (manuals) get split on headings where detectable,
 *   falling back to a word-count sliding window with overlap so no
 *   sentence gets cut in a way that loses meaning.
 */

const WINDOW_WORDS = 350;
const OVERLAP_WORDS = 50;

export function chunkQAPairs(pairs) {
  // pairs: [{ question, answer }]
  return pairs
    .filter((p) => p.question?.trim() && p.answer?.trim())
    .map((p) => ({
      content: `Q: ${p.question.trim()}\nA: ${p.answer.trim()}`,
      section_title: p.question.trim().slice(0, 120),
    }));
}

export function chunkFreeText(text, sectionTitle = null) {
  const headingSplit = text.split(/\n(?=#{1,3}\s|[A-Z][A-Za-z\s]{3,60}\n-{3,})/);

  if (headingSplit.length > 1) {
    return headingSplit
      .map((section) => section.trim())
      .filter(Boolean)
      .flatMap((section) => slidingWindow(section, sectionTitle));
  }

  return slidingWindow(text, sectionTitle);
}

function slidingWindow(text, sectionTitle) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= WINDOW_WORDS) {
    return [{ content: text.trim(), section_title: sectionTitle }];
  }

  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + WINDOW_WORDS, words.length);
    chunks.push({
      content: words.slice(start, end).join(' '),
      section_title: sectionTitle,
    });
    if (end === words.length) break;
    start = end - OVERLAP_WORDS;
  }
  return chunks;
}
