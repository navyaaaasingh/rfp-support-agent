import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ingestRoutes from './routes/ingest.js';
import queryRoutes from './routes/query.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', ingestRoutes);
app.use('/api', queryRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
