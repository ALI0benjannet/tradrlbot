// Client HTTP vers la couche IA (Python FastAPI, localhost:8000).
const AI_URL = `http://localhost:${process.env.AI_PORT || 8000}`;

export async function askAI(text) {
  const res = await fetch(`${AI_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`AI service ${res.status}`);
  return res.json(); // { intent, response, sentiment }
}

// Analyse NLP complète (entités, priorité, sentiment, assignation).
export async function analyzeText(text) {
  const res = await fetch(`${AI_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`AI service ${res.status}`);
  return res.json(); // analyse complète
}

export async function transcribe(audioBase64) {
  const res = await fetch(`${AI_URL}/api/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: audioBase64 }),
  });
  if (!res.ok) throw new Error(`AI service ${res.status}`);
  return res.json(); // { text }
}

export async function synthesize(text, voice) {
  const res = await fetch(`${AI_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) throw new Error(`AI service ${res.status}`);
  return res.json(); // { audio }
}
