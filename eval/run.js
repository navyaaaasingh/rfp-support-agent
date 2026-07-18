import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieveChunks } from '../src/services/retrieve.js';
import { answerQuestion } from '../src/services/draft.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Evaluation harness — this is the piece that turns "I called an LLM API"
 * into "I measured whether the retrieval system actually works."
 *
 * Metrics:
 * - retrieval_hit: did the expected source document appear anywhere in
 *   the top-k retrieved chunks?
 * - confidence: what the system itself reported (low confidence should
 *   correlate with retrieval misses — worth checking in your report).
 * - latency_ms: end-to-end time for retrieval + generation.
 *
 * Run with: npm run eval
 */

async function main() {
  const testsetPath = path.join(__dirname, 'testset.json');
  const testset = JSON.parse(await fs.readFile(testsetPath, 'utf-8'));

  const results = [];
  let hits = 0;

  for (const testCase of testset) {
    const start = Date.now();
    const chunks = await retrieveChunks(testCase.question, 6);
    const answer = await answerQuestion(testCase.question, 6);
    const latency_ms = Date.now() - start;

    const retrieval_hit = chunks.some(
      (c) => c.source_doc === testCase.expected_source_doc
    );
    if (retrieval_hit) hits++;

    results.push({
      question: testCase.question,
      expected_source_doc: testCase.expected_source_doc,
      retrieval_hit,
      confidence: answer.confidence,
      latency_ms,
      top_retrieved_docs: chunks.map((c) => c.source_doc),
    });
  }

  const report = {
    run_at: new Date().toISOString(),
    total_questions: testset.length,
    retrieval_precision_at_k: testset.length ? hits / testset.length : 0,
    avg_latency_ms:
      results.reduce((sum, r) => sum + r.latency_ms, 0) / (results.length || 1),
    results,
  };

  const reportPath = path.join(__dirname, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`\nRetrieval precision@k: ${(report.retrieval_precision_at_k * 100).toFixed(1)}%`);
  console.log(`Avg latency: ${report.avg_latency_ms.toFixed(0)}ms`);
  console.log(`Full report written to eval/report.json\n`);
}

main().catch((err) => {
  console.error('[eval] failed:', err);
  process.exit(1);
});
