import fs from 'node:fs/promises';
import { parse as parseCsv } from 'csv-parse/sync';
import mammoth from 'mammoth';
// pdf-parse's default export runs a debug code path on import in some
// versions when required directly — import the lib entrypoint instead.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { pool } from '../config/db.js';
import { embedBatch } from './gemini.js';
import { chunkQAPairs, chunkFreeText } from './chunker.js';

/**
 * Ingest one uploaded file. Returns the number of chunks stored.
 *
 * sourceType: 'rfp_answer' | 'manual' | 'faq'
 * For CSV files we expect two columns: question, answer.
 */
export async function ingestFile({ filePath, fileName, sourceType }) {
  const ext = fileName.split('.').pop().toLowerCase();
  let rawChunks = [];

  if (ext === 'csv') {
    const csvText = await fs.readFile(filePath, 'utf-8');
    const records = parseCsv(csvText, { columns: true, skip_empty_lines: true });
    const pairs = records.map((r) => ({
      question: r.question || r.Question,
      answer: r.answer || r.Answer,
    }));
    rawChunks = chunkQAPairs(pairs);
  } else if (ext === 'pdf') {
    const buffer = await fs.readFile(filePath);
    const { text } = await pdfParse(buffer);
    rawChunks = chunkFreeText(text);
  } else if (ext === 'docx') {
    const { value: text } = await mammoth.extractRawText({ path: filePath });
    rawChunks = chunkFreeText(text);
  } else if (ext === 'md' || ext === 'txt') {
    const text = await fs.readFile(filePath, 'utf-8');
    rawChunks = chunkFreeText(text);
  } else {
    throw new Error(`Unsupported file type: .${ext}`);
  }

  if (rawChunks.length === 0) return 0;

  const embeddings = await embedBatch(rawChunks.map((c) => c.content));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rawChunks.length; i++) {
      await client.query(
        `insert into chunks (content, embedding, source_doc, source_type, section_title)
         values ($1, $2, $3, $4, $5)`,
        [
          rawChunks[i].content,
          `[${embeddings[i].join(',')}]`,
          fileName,
          sourceType,
          rawChunks[i].section_title || null,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return rawChunks.length;
}
