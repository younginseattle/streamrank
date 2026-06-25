// server/index.js
// Lightweight Express proxy. Keeps API keys out of the browser.
// Runs on port 3001; Vite proxies /api/* to here.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app  = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ── Determine which streaming API key + base URL to use ────────────────────
function getStreamingConfig() {
  if (process.env.MOTN_API_KEY && process.env.MOTN_API_KEY !== 'your_movie_of_the_night_key_here') {
    return {
      baseUrl: 'https://api.movieofthenight.com/v4',
      headers: { 'X-API-Key': process.env.MOTN_API_KEY },
    };
  }
  if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'your_rapidapi_key_here') {
    return {
      baseUrl: 'https://streaming-availability.p.rapidapi.com',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com',
      },
    };
  }
  return null;
}

// ── GET /api/catalog?service=netflix ──────────────────────────────────────
app.get('/api/catalog', async (req, res) => {
  const cfg = getStreamingConfig();
  if (!cfg) {
    return res.status(500).json({ error: 'No streaming API key configured. Check your .env file.' });
  }

  const { service } = req.query;
  if (!service) return res.status(400).json({ error: 'Missing ?service= parameter' });

  try {
    const url = new URL(`${cfg.baseUrl}/shows/search/filters`);
    url.searchParams.set('country',            'us');
    url.searchParams.set('catalogs',           service);
    url.searchParams.set('order_by',           'rating');
    url.searchParams.set('order_direction',    'desc');
    url.searchParams.set('series_granularity', 'show');

    const upstream = await fetch(url.toString(), { headers: cfg.headers });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error(`[catalog] upstream ${upstream.status} for ${service}:`, text.slice(0, 300));
      return res.status(upstream.status).json({ error: `Upstream error ${upstream.status}`, detail: text.slice(0, 300) });
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error('[catalog] fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/analyze  (Anthropic proxy) ──────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'your_anthropic_key_here') {
    return res.status(500).json({ error: 'No Anthropic API key configured.' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[analyze] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const cfg = getStreamingConfig();
  res.json({
    streaming: cfg ? (cfg.baseUrl.includes('movieofthenight') ? 'motn' : 'rapidapi') : 'not configured',
    anthropic: process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here'
      ? 'configured' : 'not configured',
  });
});

app.listen(PORT, () => {
  const cfg = getStreamingConfig();
  console.log(`\n🎬 StreamRank server running on http://localhost:${PORT}`);
  console.log(`   Streaming API: ${cfg ? (cfg.baseUrl.includes('movieofthenight') ? '✓ Movie of the Night' : '✓ RapidAPI') : '✗ NOT CONFIGURED'}`);
  console.log(`   Anthropic:     ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here' ? '✓ configured' : '✗ not configured'}`);
  console.log(`   React app:     http://localhost:5173\n`);
});
