import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import os from 'node:os';
import { ingestFile } from '../services/ingest.js';

const upload = multer({ dest: os.tmpdir() });
const router = Router();

const VALID_TYPES = new Set(['rfp_answer', 'manual', 'faq']);

router.post('/ingest', upload.single('file'), async (req, res) => {
  const { sourceType } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded (field name: file)' });
  }
  if (!VALID_TYPES.has(sourceType)) {
    return res.status(400).json({
      error: `sourceType must be one of: ${[...VALID_TYPES].join(', ')}`,
    });
  }

  try {
    const chunkCount = await ingestFile({
      filePath: req.file.path,
      fileName: req.file.originalname,
      sourceType,
    });
    res.json({ fileName: req.file.originalname, chunksStored: chunkCount });
  } catch (err) {
    console.error('[ingest] failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
});

export default router;
