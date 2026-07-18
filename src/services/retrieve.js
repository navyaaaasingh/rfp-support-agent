import { pool } from '../config/db.js';
import { embedText } from './gemini.js';

/**
 * Retrieve the top-k most similar chunks to a question.
 * Uses pgvector's cosine distance operator (<=>); similarity = 1 - distance.
 */
export async function retrieveChunks(question, k = 6) {
  const embedding = await embedText(question);
  const vectorLiteral = `[${embedding.join(',')}]`;

  const { rows } = await pool.query(
    `select
       id, content, source_doc, source_type, section_title,
       1 - (embedding <=> $1) as similarity
     from chunks
     order by embedding <=> $1
     limit $2`,
    [vectorLiteral, k]
  );

  return rows;
}
