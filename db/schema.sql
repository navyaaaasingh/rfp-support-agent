-- Run this once against your Supabase / Neon Postgres database.

create extension if not exists vector;

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(768),          -- gemini-embedding-001 default output size
  source_doc text not null,
  source_type text not null,      -- 'rfp_answer' | 'manual' | 'faq'
  section_title text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- Approximate nearest-neighbor index for cosine distance search.
-- Rebuild / re-ANALYZE after large bulk ingests for best recall.
create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists chunks_source_type_idx on chunks (source_type);
