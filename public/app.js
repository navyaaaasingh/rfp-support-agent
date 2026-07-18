const ingestForm = document.getElementById('ingest-form');
const ingestStatus = document.getElementById('ingest-status');
const queryForm = document.getElementById('query-form');
const resultCard = document.getElementById('result-card');
const confidenceBadge = document.getElementById('confidence-badge');
const draftAnswerEl = document.getElementById('draft-answer');
const sourcesList = document.getElementById('sources-list');
const approveBtn = document.getElementById('approve-btn');
const editBtn = document.getElementById('edit-btn');

ingestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(ingestForm);
  ingestStatus.textContent = 'Ingesting...';

  try {
    const res = await fetch('/api/ingest', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ingest failed');
    ingestStatus.textContent = `Stored ${data.chunksStored} chunks from ${data.fileName}.`;
    ingestForm.reset();
  } catch (err) {
    ingestStatus.textContent = `Error: ${err.message}`;
  }
});

queryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = document.getElementById('question-input').value.trim();
  if (!question) return;

  resultCard.hidden = false;
  draftAnswerEl.textContent = 'Thinking...';
  sourcesList.innerHTML = '';
  confidenceBadge.textContent = '';

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Query failed');

    draftAnswerEl.textContent = data.draft_answer;
    confidenceBadge.textContent = `Confidence: ${data.confidence}`;
    confidenceBadge.className = `confidence-badge ${data.confidence}`;

    sourcesList.innerHTML = data.sources
      .map(
        (s) =>
          `<li>${s.source_doc}${s.section_title ? ` — ${s.section_title}` : ''} (similarity: ${s.similarity})</li>`
      )
      .join('') || '<li>No strong sources found — review carefully before sending.</li>';
  } catch (err) {
    draftAnswerEl.textContent = `Error: ${err.message}`;
  }
});

approveBtn.addEventListener('click', () => {
  draftAnswerEl.contentEditable = false;
  approveBtn.textContent = 'Approved ✓';
  approveBtn.disabled = true;
});

editBtn.addEventListener('click', () => {
  draftAnswerEl.contentEditable = true;
  draftAnswerEl.focus();
});
