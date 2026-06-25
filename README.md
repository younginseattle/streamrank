# StreamRank

A personal streaming content scoring engine that aggregates and ranks TV shows and movies across multiple streaming services based on your preferences.

## Features

- **Multi-service aggregation** — Browse content from Netflix, Hulu, Disney+, Max, Prime Video, and Apple TV+ in one place
- **Customizable scoring** — Tune 8 scoring parameters (rating, hidden gem bonus, mood tags, runtime, recency, and more) to match your taste
- **Per-service controls** — Toggle scoring weights and refresh rates independently for each service
- **AI taste analysis** — Get insights on your viewing preferences powered by Claude
- **Dark theme UI** — Service-branded colors with circular score meters

## Tech Stack

- **Frontend:** React 18 + Vite
- **Backend:** Express (Node.js proxy server)
- **APIs:** Movie of the Night / RapidAPI (catalog), Anthropic Claude (AI analysis)

## Getting Started

### Prerequisites

- Node.js 18+
- An API key from one of:
  - [Movie of the Night](https://developers.movieofthenight.com/) (free tier available, no credit card)
  - [RapidAPI — Streaming Availability](https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability)
- (Optional) An [Anthropic API key](https://console.anthropic.com/) for AI taste analysis

### Installation

```bash
git clone https://github.com/younginseattle/streamrank.git
cd streamrank
npm install
```

Copy the environment template and fill in your keys:

```bash
cp .env.example .env
```

`.env` fields:

| Variable | Required | Description |
|---|---|---|
| `MOTN_API_KEY` | One of these two | Movie of the Night API key |
| `RAPIDAPI_KEY` | One of these two | RapidAPI key for the same catalog |
| `ANTHROPIC_API_KEY` | No | Enables AI taste analysis |

### Running

```bash
npm run dev
```

This starts both the Vite dev server (http://localhost:5173) and the Express proxy (http://localhost:3001) concurrently.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start frontend + backend together |
| `npm run client` | Vite dev server only |
| `npm run server` | Express proxy only |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## How It Works

1. The Express server proxies requests to the streaming catalog API, keeping your API keys out of the browser.
2. The React frontend fetches catalog data via `/api/catalog` and scores each title using your configured parameters.
3. Clicking **AI Taste Analysis** sends your preferences to `/api/analyze`, which calls Claude and returns personalized insights.
