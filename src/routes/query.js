import { Router } from 'express';
import { parse as parseCsv } from 'csv-parse/sync';
import { answerQuestion } from '../services/draft.js';

const router = Router();

router.post('/query', async (req, res) => {
  const { question } = req.body;
  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    const result = await answerQuestion(question.trim());
    res.json(result);
  } catch (err) {
    console.error('[query] failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk mode: paste a newline-separated list of questions, or a CSV with a
// "question" column (e.g. an incoming RFP question sheet).
router.post('/query/bulk', async (req, res) => {
  const { questions, csv } = req.body;
  let questionList = [];

  if (Array.isArray(questions)) {
    questionList = questions;
  } else if (typeof csv === 'string') {
    const records = parseCsv(csv, { columns: true, skip_empty_lines: true });
    questionList = records.map((r) => r.question || r.Question).filter(Boolean);
  }

  if (questionList.length === 0) {
    return res.status(400).json({ error: 'Provide questions[] or csv text' });
  }

  // Sequential, not parallel — stays well under the free-tier RPM cap on
  // both the embedding and generation endpoints for larger question lists.
  const results = [];
  for (const q of questionList) {
    try {
      results.push(await answerQuestion(q));
    } catch (err) {
      results.push({ question: q, error: err.message });
    }
  }

  res.json({ results });
});

export default router;
