import { useState, useEffect, useCallback, useRef } from "react";

// ── Service config ─────────────────────────────────────────────────────────────
const SERVICE_CONFIG = {
  netflix: { label: "Netflix",   color: "#E50914", bg: "#1a0103", apiId: "netflix" },
  hulu:    { label: "Hulu",      color: "#1CE783", bg: "#011a0b", apiId: "hulu"    },
  disney:  { label: "Disney+",   color: "#0063E5", bg: "#000d1a", apiId: "disney"  },
  hbo:     { label: "Max",       color: "#A855F7", bg: "#120a1a", apiId: "hbo"     },
  prime:   { label: "Prime",     color: "#00A8E1", bg: "#001a22", apiId: "prime"   },
  apple:   { label: "Apple TV+", color: "#F5F5F7", bg: "#111111", apiId: "apple"   },
};

const REFRESH_OPTIONS = [
  { label: "Manual", ms: null        },
  { label: "1 min",  ms: 60_000     },
  { label: "5 min",  ms: 300_000    },
  { label: "15 min", ms: 900_000    },
  { label: "1 hr",   ms: 3_600_000  },
  { label: "Daily",  ms: 86_400_000 },
];

// ── Scoring params ─────────────────────────────────────────────────────────────
const ALL_PARAMS = [
  { id: "rating",         label: "Overall Rating",        description: "Aggregated score 0–100",      weight: 35, enabled: true  },
  { id: "hidden_gem",     label: "Hidden Gem Bonus",      description: "High score, low popularity",  weight: 15, enabled: true  },
  { id: "family",         label: "Family Friendly",       description: "Suitable for all ages",       weight: 0,  enabled: false },
  { id: "short_runtime",  label: "Short Episodes",        description: "Under 45 min / episode",      weight: 10, enabled: true  },
  { id: "recency",        label: "Recency",               description: "Newer content preferred",     weight: 0,  enabled: false },
  { id: "mood_cerebral",  label: "Cerebral / Thoughtful", description: "Drama, history, docs",        weight: 20, enabled: true  },
  { id: "mood_epic",      label: "Epic / Cinematic",      description: "Action, sci-fi, fantasy",     weight: 20, enabled: true  },
  { id: "mood_funny",     label: "Comedy",                description: "Comedies and sitcoms",        weight: 0,  enabled: false },
  { id: "mood_romance",   label: "Romance",               description: "Love stories & relationships",weight: 0,  enabled: false },
  { id: "mood_romcom",    label: "Romantic Comedy",       description: "Light, fun romance + laughs", weight: 0,  enabled: false },
  { id: "mood_truecrime", label: "True Crime",            description: "Crime docs & investigations", weight: 0,  enabled: false },
  { id: "mood_reality",   label: "Reality TV",            description: "Competition & reality shows", weight: 0,  enabled: false },
  { id: "mood_thriller",  label: "Thriller / Mystery",    description: "Suspense and whodunits",      weight: 0,  enabled: false },
];

// Preset param sets per profile
const MATT_PARAMS = ALL_PARAMS.map(p => ({
  ...p,
  enabled: ["rating","hidden_gem","short_runtime","mood_cerebral","mood_epic"].includes(p.id),
  weight:  p.id === "rating" ? 35 : p.id === "hidden_gem" ? 15 : p.id === "short_runtime" ? 10
         : p.id === "mood_cerebral" ? 20 : p.id === "mood_epic" ? 20 : p.weight,
}));

const WIFE_PARAMS = ALL_PARAMS.map(p => ({
  ...p,
  enabled: ["rating","mood_romance","mood_romcom","mood_funny","mood_truecrime","mood_reality"].includes(p.id),
  weight:  p.id === "rating" ? 25 : p.id === "mood_romance" ? 20 : p.id === "mood_romcom" ? 20
         : p.id === "mood_funny" ? 15 : p.id === "mood_truecrime" ? 15 : p.id === "mood_reality" ? 15 : p.weight,
}));

const DEFAULT_PROFILES = [
  { id: "matt", name: "Matt",  params: MATT_PARAMS, filterType: "all", sortBy: "score", minScore: 0,  dismissed: [] },
  { id: "wife", name: "Wife",  params: WIFE_PARAMS, filterType: "all", sortBy: "score", minScore: 25, dismissed: [] },
];

function loadProfiles() {
  try {
    const stored = localStorage.getItem("streamrank_profiles");
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate stored profiles: fill in any fields added after initial save
      return parsed.map(p => {
        // Ensure all params from ALL_PARAMS exist (new params added later won't be in old saves)
        const storedParamIds = new Set((p.params ?? []).map(x => x.id));
        const mergedParams = [
          ...(p.params ?? []),
          ...ALL_PARAMS.filter(ap => !storedParamIds.has(ap.id)),
        ];
        return {
          ...p,
          params: mergedParams,
          minScore: p.minScore ?? 0,
        };
      });
    }
  } catch { /* ignore */ }
  return DEFAULT_PROFILES;
}

function saveProfiles(profiles) {
  try { localStorage.setItem("streamrank_profiles", JSON.stringify(profiles)); } catch { /* ignore */ }
}

// ── Scoring ────────────────────────────────────────────────────────────────────
function scoreItem(item, params) {
  const active = params.filter(p => p.enabled && p.weight > 0);
  const totalW = active.reduce((s, p) => s + p.weight, 0);
  if (!totalW) return 0;
  let total = 0;
  for (const p of active) {
    let s = 0;
    const mood = item.mood ?? [];
    if      (p.id === "rating")         s = (item.rating ?? 50) / 100;
    else if (p.id === "hidden_gem")     s = (item.rating ?? 0) > 80 && (item.popularity ?? 100) < 70 ? 1 : 0;
    else if (p.id === "family")         s = item.family ? 1 : 0;
    else if (p.id === "short_runtime")  s = item.type === "series" ? Math.max(0, 1 - ((item.runtime ?? 45) - 20) / 60) : 0;
    else if (p.id === "recency")        s = Math.max(0, ((item.year ?? 2018) - 2015) / 10);
    else if (p.id === "mood_cerebral")  s = mood.includes("cerebral")  ? 1 : 0;
    else if (p.id === "mood_epic")      s = mood.includes("epic")      ? 1 : 0;
    else if (p.id === "mood_funny")     s = mood.includes("funny")     ? 1 : 0;
    else if (p.id === "mood_romance")   s = mood.includes("romance")   ? 1 : 0;
    else if (p.id === "mood_romcom")    s = mood.includes("romcom")    ? 1 : 0;
    else if (p.id === "mood_truecrime") s = mood.includes("truecrime") ? 1 : 0;
    else if (p.id === "mood_reality")   s = mood.includes("reality")   ? 1 : 0;
    else if (p.id === "mood_thriller")  s = mood.includes("intense")   ? 1 : 0;
    total += s * p.weight;
  }
  return Math.round((total / totalW) * 100);
}

// ── Data helpers ───────────────────────────────────────────────────────────────
function inferMood(genres) {
  const g = genres.map(s => s.toLowerCase());
  const mood = [];
  const isComedy   = g.some(n => /comedy/.test(n));
  const isRomance  = g.some(n => /romance/.test(n));
  const isCrime    = g.some(n => /crime/.test(n));
  const isDoc      = g.some(n => /documentary/.test(n));
  const isReality  = g.some(n => /reality/.test(n));

  if (g.some(n => /thriller|mystery|horror/.test(n)))            mood.push("intense");
  if (isCrime)                                                    mood.push("intense");
  if (isComedy)                                                   mood.push("funny");
  if (g.some(n => /drama|history|biography/.test(n)) || isDoc)  mood.push("cerebral");
  if (isDoc)                                                      mood.push("cerebral");
  if (g.some(n => /action|adventure|sci.?fi|fantasy/.test(n)))  mood.push("epic");
  if (g.some(n => /animation|family/.test(n)))                   mood.push("heartwarming");
  if (isRomance)                                                  mood.push("romance");
  if (isComedy && isRomance)                                      mood.push("romcom");
  if (isCrime && (isDoc || isReality))                           mood.push("truecrime");
  if (isReality)                                                  mood.push("reality");
  return mood.length ? [...new Set(mood)] : ["cerebral"];
}

function normalizeShow(show, serviceId) {
  const countryOpts = show.streamingOptions?.us ?? [];
  const opt = countryOpts.find(o => o.service?.id === serviceId) ?? countryOpts[0] ?? {};
  const genres = (show.genres ?? []).map(g => (typeof g === "string" ? g : g.name ?? ""));
  return {
    id:          show.id ?? show.imdbId ?? String(Math.random()),
    title:       show.title ?? "Unknown",
    type:        show.showType === "movie" ? "movie" : "series",
    year:        show.firstAirYear ?? show.releaseYear ?? 0,
    runtime:     show.runtime ?? null,
    rating:      typeof show.rating === "number" ? show.rating : null,
    seasons:     show.seasonCount ?? null,
    service:     serviceId,
    genres,
    mood:        inferMood(genres),
    family:      genres.some(g => /animation|family/i.test(g)),
    hidden_gem:  false,
    popularity:  60,
    description: show.overview ?? "",
    deepLink:    opt.link ?? null,
    poster:      show.imageSet?.verticalPoster?.w240
              ?? show.imageSet?.horizontalPoster?.w360
              ?? null,
  };
}

async function fetchServiceCatalog(serviceId) {
  const res = await fetch(`/api/catalog?service=${serviceId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  const shows = Array.isArray(data.shows) ? data.shows : Array.isArray(data) ? data : [];
  return shows.map(show => normalizeShow(show, serviceId));
}

// ── UI Components ──────────────────────────────────────────────────────────────
function ScoreMeter({ score, size = 50 }) {
  const r = 19, circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 75 ? "#7C3AED" : pct >= 55 ? "#A78BFA" : pct >= 35 ? "#9CA3AF" : "#4B5563";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1F2937" strokeWidth={3.5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3.5}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1), stroke 0.3s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", fontFamily: "'Bebas Neue',sans-serif",
        fontSize: 14, color: "#F9FAFB", letterSpacing: "0.02em" }}>
        {pct}
      </div>
    </div>
  );
}

function ServiceBadge({ service, href }) {
  const cfg = SERVICE_CONFIG[service];
  if (!cfg) return null;
  const style = {
    display: "inline-flex", padding: "2px 7px", borderRadius: 4,
    background: cfg.bg, border: `1px solid ${cfg.color}44`,
    fontSize: 10, fontWeight: 700, color: cfg.color,
    letterSpacing: "0.05em", fontFamily: "Inter,sans-serif", textTransform: "uppercase",
    textDecoration: "none", cursor: href ? "pointer" : "default",
  };
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()} style={style}>
        {cfg.label} ↗
      </a>
    );
  }
  return <span style={style}>{cfg.label}</span>;
}

function ContentCard({ item, score, rank, onDismiss, tmdb }) {
  const [open, setOpen] = useState(false);
  const primaryService = item.services[0];
  const cfg = SERVICE_CONFIG[primaryService] ?? { color: "#7C3AED" };
  const poster = tmdb?.poster ?? item.poster ?? null;
  const overview = tmdb?.overview ?? item.description ?? "";
  const displayRating = tmdb?.tmdbRating ?? item.rating;
  const genres = tmdb?.genres?.length ? tmdb.genres : item.genres;

  return (
    <div onClick={() => setOpen(o => !o)}
      style={{ background: "#0F0F18", borderRadius: 9, padding: "11px 14px", cursor: "pointer",
        transition: "background 0.15s", border: "1px solid #1F2937",
        borderLeft: score >= 75 ? `3px solid ${cfg.color}` : "1px solid #1F2937" }}
      onMouseEnter={e => e.currentTarget.style.background = "#131320"}
      onMouseLeave={e => e.currentTarget.style.background = "#0F0F18"}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "#6B7280",
          width: 24, textAlign: "right", flexShrink: 0 }}>{rank}</span>
        <ScoreMeter score={score} size={46} />
        <div style={{ width: 36, height: 54, flexShrink: 0, borderRadius: 4, overflow: "hidden",
          background: "#1F2937", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {poster
            ? <img src={poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: 16, opacity: 0.2 }}>🎬</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16,
              color: "#F9FAFB", letterSpacing: "0.03em" }}>{item.title}</span>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter,sans-serif" }}>
              {item.year > 0 ? item.year : ""}
              {item.type === "series" && item.seasons ? ` · ${item.seasons}S` : ""}
              {item.type === "movie"  && item.runtime  ? ` · ${item.runtime}m` : ""}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {item.services.map(svc =>
              <ServiceBadge key={svc} service={svc} href={item.deepLinks[svc] ?? null} />
            )}
            {genres.slice(0, 2).map(g =>
              <span key={g} style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter,sans-serif" }}>{g}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
          {tmdb?.rtScore != null && (
            <div style={{ textAlign: "center", minWidth: 36 }}>
              <div style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase",
                letterSpacing: "0.07em", fontFamily: "Inter,sans-serif" }}>
                {tmdb.rtScore >= 60 ? "🍅" : "🤢"}
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14,
                color: tmdb.rtScore >= 60 ? "#EF4444" : "#9CA3AF" }}>
                {tmdb.rtScore}%
              </div>
            </div>
          )}
          <div style={{ textAlign: "center", minWidth: 36 }}>
            <div style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase",
              letterSpacing: "0.07em", fontFamily: "Inter,sans-serif" }}>Score</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14,
              color: displayRating != null && displayRating >= 80 ? "#22C55E" : "#C4B5FD" }}>
              {displayRating ?? "—"}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDismiss(); }}
            title="Remove from list"
            style={{ fontSize: 15, lineHeight: 1, padding: "2px 6px", borderRadius: 4,
              border: "1px solid #1F2937", background: "transparent",
              color: "#6B7280", cursor: "pointer", flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "#EF444444"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#6B7280"; e.currentTarget.style.borderColor = "#1F2937"; }}>
            ×
          </button>
        </div>
      </div>
      {open && (overview || tmdb?.tagline) && (
        <div style={{ display: "flex", gap: 12, marginTop: 9, paddingTop: 9, borderTop: "1px solid #1F2937" }}>
          {poster && (
            <img src={poster} alt="" style={{ width: 60, height: 90, objectFit: "cover",
              borderRadius: 4, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            {(tmdb?.rtScore != null || tmdb?.imdbRating != null || tmdb?.metascore != null) && (
              <div style={{ display: "flex", gap: 12, marginBottom: 7, flexWrap: "wrap" }}>
                {tmdb.rtScore != null && (
                  <span style={{ fontSize: 11, fontFamily: "Inter,sans-serif", fontWeight: 600,
                    color: tmdb.rtScore >= 60 ? "#EF4444" : "#9CA3AF" }}>
                    {tmdb.rtScore >= 60 ? "🍅" : "🤢"} RT {tmdb.rtScore}%
                  </span>
                )}
                {tmdb.imdbRating != null && (
                  <span style={{ fontSize: 11, fontFamily: "Inter,sans-serif", fontWeight: 600, color: "#F5C518" }}>
                    ⭐ IMDb {(tmdb.imdbRating / 10).toFixed(1)}
                  </span>
                )}
                {tmdb.metascore != null && (
                  <span style={{ fontSize: 11, fontFamily: "Inter,sans-serif", fontWeight: 600,
                    color: tmdb.metascore >= 61 ? "#22C55E" : tmdb.metascore >= 40 ? "#F59E0B" : "#EF4444" }}>
                    M {tmdb.metascore}
                  </span>
                )}
              </div>
            )}
            {tmdb?.tagline && (
              <div style={{ fontSize: 11, color: "#7C3AED", fontStyle: "italic",
                fontFamily: "Inter,sans-serif", marginBottom: 5 }}>"{tmdb.tagline}"</div>
            )}
            <div style={{ fontSize: 12, color: "#C4B5FD", fontFamily: "Inter,sans-serif", lineHeight: 1.65 }}>
              {overview}
            </div>
            {item.mood.length > 0 && (
              <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
                {item.mood.map(m => (
                  <span key={m} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3,
                    background: "#1F2937", color: "#9CA3AF", textTransform: "uppercase",
                    letterSpacing: "0.06em", fontWeight: 600 }}>{m}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ParamSlider({ param, onChange }) {
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid #0D1117" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <button onClick={() => onChange({ ...param, enabled: !param.enabled })} style={{
            width: 14, height: 14, borderRadius: 3, flexShrink: 0, padding: 0,
            border: `1.5px solid ${param.enabled ? "#7C3AED" : "#374151"}`,
            background: param.enabled ? "#7C3AED" : "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {param.enabled && <span style={{ color: "#fff", fontSize: 8, lineHeight: 1 }}>✓</span>}
          </button>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "Inter,sans-serif",
              color: param.enabled ? "#E5E7EB" : "#6B7280", transition: "color 0.2s" }}>
              {param.label}
            </div>
            <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter,sans-serif" }}>
              {param.description}
            </div>
          </div>
        </div>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16,
          color: param.enabled ? "#7C3AED" : "#4B5563", minWidth: 24, textAlign: "right" }}>
          {param.weight}
        </span>
      </div>
      {param.enabled && (
        <input type="range" min={0} max={50} step={5} value={param.weight}
          onChange={e => onChange({ ...param, weight: parseInt(e.target.value) })}
          style={{ width: "100%", accentColor: "#7C3AED", cursor: "pointer", height: 3 }} />
      )}
    </div>
  );
}

function StatusDot({ status }) {
  const colors = { idle: "#4B5563", loading: "#F59E0B", loaded: "#22C55E", error: "#EF4444" };
  return (
    <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
      background: colors[status] ?? "#4B5563",
      boxShadow: status === "loading" ? "0 0 5px #F59E0B" : status === "loaded" ? "0 0 5px #22C55E88" : "none" }} />
  );
}

function RefreshControl({ svcKey, refreshRate, onRateChange, status, lastFetched, onNow }) {
  const [open, setOpen] = useState(false);
  const cfg = SERVICE_CONFIG[svcKey];
  const secs = lastFetched ? Math.round((Date.now() - lastFetched) / 1000) : null;
  const ago = secs === null ? "—" : secs < 60 ? `${secs}s ago` : secs < 3600
    ? `${Math.round(secs / 60)}m ago` : `${Math.round(secs / 3600)}h ago`;
  const rateName = REFRESH_OPTIONS.find(o => o.ms === refreshRate)?.label ?? "Manual";

  return (
    <div style={{ padding: "7px 0", borderBottom: "1px solid #0D1117" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <StatusDot status={status} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#E5E7EB", fontFamily: "Inter,sans-serif" }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter,sans-serif" }}>{ago}</span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <button onClick={() => setOpen(o => !o)} style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
            border: `1px solid ${refreshRate ? "#7C3AED" : "#1F2937"}`,
            background: "transparent", color: refreshRate ? "#A78BFA" : "#6B7280",
            fontFamily: "Inter,sans-serif", fontWeight: 600 }}>
            {rateName}
          </button>
          <button onClick={onNow} disabled={status === "loading"} title="Refresh now" style={{
            fontSize: 13, padding: "0px 5px", borderRadius: 4, lineHeight: 1.6,
            border: "1px solid #1F2937", background: "transparent",
            color: "#9CA3AF", cursor: status === "loading" ? "not-allowed" : "pointer" }}>
            ↻
          </button>
        </div>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
          {REFRESH_OPTIONS.map(opt => (
            <button key={opt.label} onClick={() => { onRateChange(opt.ms); setOpen(false); }} style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${refreshRate === opt.ms ? "#7C3AED" : "#1F2937"}`,
              background: refreshRate === opt.ms ? "#2D1B6B" : "transparent",
              color: refreshRate === opt.ms ? "#A78BFA" : "#6B7280",
              fontFamily: "Inter,sans-serif", fontWeight: 600 }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {status === "error" && (
        <div style={{ fontSize: 10, color: "#EF4444", fontFamily: "Inter,sans-serif", marginTop: 3 }}>
          Failed — check server logs or hit ↻ to retry
        </div>
      )}
    </div>
  );
}

function AIInsight({ params, scored, profileName }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);

  const run = async () => {
    setLoading(true); setShown(true);
    const top5 = scored.slice(0, 5).map(s =>
      `${s.item.title} (score: ${s.score}, on ${s.item.services.map(svc => SERVICE_CONFIG[svc]?.label).join("/")})`
    ).join(", ");
    const ps = params.filter(p => p.enabled && p.weight > 0)
      .map(p => `${p.label}(${p.weight})`).join(", ");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content:
            `You're a streaming content advisor for ${profileName}. Their scoring weights are: ${ps}. ` +
            `Their top 5 right now: ${top5}. In 2-3 sentences, describe what their taste ` +
            `profile reveals, then give one specific watch-first pick with a brief reason. ` +
            `Conversational and direct.`
          }]
        })
      });
      const d = await res.json();
      setText(d.content?.[0]?.text ?? "No response.");
    } catch (err) {
      setText(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: 12, borderRadius: 9, border: "1px solid #2D1B6B",
      background: "#0D0B1A", padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: shown ? 9 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 13 }}>◆</span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13,
            color: "#A78BFA", letterSpacing: "0.07em" }}>AI TASTE ANALYSIS</span>
        </div>
        <button onClick={run} disabled={loading || scored.length === 0} style={{
          padding: "4px 11px", borderRadius: 5, border: "1px solid #7C3AED",
          background: loading ? "#1F1035" : "#7C3AED22", color: "#A78BFA",
          fontSize: 11, fontWeight: 600, fontFamily: "Inter,sans-serif",
          cursor: (loading || scored.length === 0) ? "not-allowed" : "pointer" }}>
          {loading ? "Analyzing…" : "Analyze My Taste"}
        </button>
      </div>
      {shown && (
        <div style={{ fontSize: 12, color: "#C4B5FD", fontFamily: "Inter,sans-serif",
          lineHeight: 1.7, minHeight: 30 }}>
          {loading ? <span style={{ color: "#9CA3AF" }}>Thinking…</span> : text}
        </div>
      )}
    </div>
  );
}

// ── Profile switcher ───────────────────────────────────────────────────────────
function ProfileSwitcher({ profiles, activeId, onSwitch, onAdd, onRename, onDelete }) {
  const [editing, setEditing] = useState(null); // profileId being renamed
  const [draft, setDraft] = useState("");

  const commitRename = (id) => {
    if (draft.trim()) onRename(id, draft.trim());
    setEditing(null);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {profiles.map(p => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {editing === p.id ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => commitRename(p.id)}
              onKeyDown={e => { if (e.key === "Enter") commitRename(p.id); if (e.key === "Escape") setEditing(null); }}
              style={{ width: 70, fontSize: 12, padding: "2px 6px", borderRadius: 5,
                border: "1px solid #7C3AED", background: "#1F2937", color: "#F9FAFB",
                fontFamily: "Inter,sans-serif", outline: "none" }}
            />
          ) : (
            <button
              onClick={() => onSwitch(p.id)}
              onDoubleClick={() => { setEditing(p.id); setDraft(p.name); }}
              title="Double-click to rename"
              style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: `1px solid ${activeId === p.id ? "#7C3AED" : "#1F2937"}`,
                background: activeId === p.id ? "#2D1B6B" : "transparent",
                color: activeId === p.id ? "#E9D5FF" : "#9CA3AF",
                cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              {p.name}
            </button>
          )}
          {profiles.length > 1 && activeId === p.id && editing !== p.id && (
            <button
              onClick={() => onDelete(p.id)}
              title="Delete profile"
              style={{ fontSize: 11, color: "#4B5563", background: "transparent",
                border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>
              ×
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd} title="Add profile"
        style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
          border: "1px solid #1F2937", background: "transparent",
          color: "#6B7280", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
        + Add
      </button>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [serverOk,      setServerOk]      = useState(null);
  const [serverInfo,    setServerInfo]    = useState(null);
  const [profiles,      setProfiles]      = useState(() => loadProfiles());
  const [activeId,      setActiveId]      = useState(() => loadProfiles()[0].id);
  const [catalog,       setCatalog]       = useState({});
  const [statuses,      setStatuses]      = useState({});
  const [lastFetched,   setLastFetched]   = useState({});
  const [refreshRates,  setRefreshRates]  = useState({});
  const [activeServices,setActiveServices]= useState(Object.keys(SERVICE_CONFIG));
  const [globalRate,    setGlobalRate]    = useState(null);
  const [errorLog,      setErrorLog]      = useState([]);
  const [tmdbCache,     setTmdbCache]     = useState({});
  const tmdbQueue = useRef(new Set());
  const timers    = useRef({});

  // Active profile convenience
  const profile = profiles.find(p => p.id === activeId) ?? profiles[0];
  const params      = profile.params;
  const filterType  = profile.filterType;
  const sortBy      = profile.sortBy;
  const minScore    = profile.minScore ?? 0;
  const dismissed   = new Set(profile.dismissed);

  const updateProfile = useCallback((id, patch) => {
    setProfiles(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...patch } : p);
      saveProfiles(next);
      return next;
    });
  }, []);

  const setParams     = (p)  => updateProfile(activeId, { params: typeof p === "function" ? p(params) : p });
  const setFilterType = (ft) => updateProfile(activeId, { filterType: ft });
  const setSortBy     = (s)  => updateProfile(activeId, { sortBy: s });
  const setMinScore   = (n)  => updateProfile(activeId, { minScore: n });

  const dismiss = (item) => {
    const key = `${item.title.toLowerCase().replace(/\s+/g, " ").trim()}|${item.type}|${item.year}`;
    updateProfile(activeId, { dismissed: [...profile.dismissed, key] });
  };
  const restoreDismissed = () => updateProfile(activeId, { dismissed: [] });

  const addProfile = () => {
    const id = `profile_${Date.now()}`;
    const newProfile = { id, name: "New Profile", params: ALL_PARAMS.map(p => ({ ...p, enabled: p.id === "rating", weight: p.id === "rating" ? 35 : p.weight })), filterType: "all", sortBy: "score", minScore: 0, dismissed: [] };
    setProfiles(prev => { const next = [...prev, newProfile]; saveProfiles(next); return next; });
    setActiveId(id);
  };

  const deleteProfile = (id) => {
    setProfiles(prev => {
      const next = prev.filter(p => p.id !== id);
      saveProfiles(next);
      return next;
    });
    setActiveId(p => p === id ? profiles.find(p2 => p2.id !== id)?.id ?? profiles[0].id : p);
  };

  const renameProfile = (id, name) => updateProfile(id, { name });

  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then(d => { setServerOk(true); setServerInfo(d); })
      .catch(() => setServerOk(false));
  }, []);

  const addError = (svc, msg) =>
    setErrorLog(l => [...l.slice(-4), { svc, msg, t: new Date().toLocaleTimeString() }]);

  const fetchSvc = useCallback(async (svcId) => {
    setStatuses(s => ({ ...s, [svcId]: "loading" }));
    try {
      const items = await fetchServiceCatalog(SERVICE_CONFIG[svcId].apiId);
      setCatalog(c => ({ ...c, [svcId]: items }));
      setStatuses(s => ({ ...s, [svcId]: "loaded" }));
      setLastFetched(l => ({ ...l, [svcId]: Date.now() }));
    } catch (e) {
      setStatuses(s => ({ ...s, [svcId]: "error" }));
      addError(svcId, e.message);
    }
  }, []);

  const fetchTmdb = useCallback(async (items) => {
    const toFetch = items.filter(item => !tmdbQueue.current.has(item.groupKey));
    if (!toFetch.length) return;
    toFetch.forEach(item => tmdbQueue.current.add(item.groupKey));
    for (let i = 0; i < toFetch.length; i += 10) {
      const batch = toFetch.slice(i, i + 10);
      await Promise.all(batch.map(async (item) => {
        try {
          const p = new URLSearchParams({ title: item.title, type: item.type });
          if (item.year > 0) p.set("year", item.year);
          const res = await fetch(`/api/tmdb?${p}`);
          if (!res.ok) return;
          const data = await res.json();
          setTmdbCache(c => ({ ...c, [item.groupKey]: data }));
        } catch { /* silently skip */ }
      }));
      if (i + 10 < toFetch.length) await new Promise(r => setTimeout(r, 300));
    }
  }, []);

  const setRate = useCallback((svcId, ms) => {
    setRefreshRates(r => ({ ...r, [svcId]: ms }));
    if (timers.current[svcId]) { clearInterval(timers.current[svcId]); delete timers.current[svcId]; }
    if (ms) timers.current[svcId] = setInterval(() => fetchSvc(svcId), ms);
  }, [fetchSvc]);

  const setGlobal = (ms) => {
    setGlobalRate(ms);
    Object.keys(SERVICE_CONFIG).forEach(svc => setRate(svc, ms));
  };

  useEffect(() => () => Object.values(timers.current).forEach(clearInterval), []);
  useEffect(() => { if (serverOk) activeServices.forEach(svc => fetchSvc(svc)); }, [serverOk]); // eslint-disable-line

  // Consolidate same title across services
  const allItems = Object.entries(catalog)
    .filter(([svc]) => activeServices.includes(svc))
    .flatMap(([, items]) => items);

  const grouped = new Map();
  for (const item of allItems) {
    const normTitle = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    const key = `${normTitle}|${item.type}|${item.year}`;
    if (grouped.has(key)) {
      const existing = grouped.get(key);
      if (!existing.services.includes(item.service)) {
        existing.services.push(item.service);
        existing.deepLinks[item.service] = item.deepLink;
      }
    } else {
      grouped.set(key, { ...item, groupKey: key, services: [item.service], deepLinks: { [item.service]: item.deepLink } });
    }
  }
  const consolidated = Array.from(grouped.values());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (consolidated.length) fetchTmdb(consolidated); }, [consolidated.length]);

  const dismissKey = (item) =>
    `${item.title.toLowerCase().replace(/\s+/g, " ").trim()}|${item.type}|${item.year}`;

  const scored = consolidated
    .filter(i => filterType === "all" || i.type === filterType)
    .filter(i => !dismissed.has(dismissKey(i)))
    .map(item => ({ item, score: scoreItem(item, params) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => sortBy === "score" ? b.score - a.score : (b.item.rating ?? 0) - (a.item.rating ?? 0));

  const totalRaw    = Object.values(catalog).flat().length;
  const anyLoading  = Object.values(statuses).some(s => s === "loading");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07070F; margin: 0; }
        input[type=range] { -webkit-appearance: none; appearance: none; background: #1F2937; border-radius: 2px; height: 3px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #7C3AED; cursor: pointer; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1F2937; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#07070F", color: "#F9FAFB", fontFamily: "Inter,sans-serif" }}>

        {/* ── Header ── */}
        <div style={{ borderBottom: "1px solid #111827", padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: "0.08em" }}>
              STREAMRANK
            </span>
            <span style={{ fontSize: 10, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Personal Scoring Engine
            </span>
          </div>

          {/* Profile switcher */}
          <ProfileSwitcher
            profiles={profiles}
            activeId={activeId}
            onSwitch={setActiveId}
            onAdd={addProfile}
            onRename={renameProfile}
            onDelete={deleteProfile}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {serverOk === null && (
              <span style={{ fontSize: 11, color: "#9CA3AF", animation: "pulse 1s infinite" }}>
                connecting…
              </span>
            )}
            {serverOk === true && (
              <>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E",
                  boxShadow: "0 0 5px #22C55E" }} />
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                  {consolidated.length} titles
                  {anyLoading && <span style={{ color: "#F59E0B", marginLeft: 6, animation: "pulse 1s infinite" }}>fetching…</span>}
                </span>
              </>
            )}
            {serverOk === false && (
              <span style={{ fontSize: 11, color: "#EF4444" }}>
                ✗ Server offline — run <code style={{ background: "#1F2937", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>npm run dev</code>
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", minHeight: "calc(100vh - 49px)" }}>

          {/* ── Left Rail ── */}
          <div style={{ width: 248, flexShrink: 0, borderRight: "1px solid #111827",
            padding: "13px 11px", overflowY: "auto", position: "sticky", top: 0,
            height: "calc(100vh - 49px)" }}>

            {/* Services & Refresh */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11,
                  letterSpacing: "0.1em", color: "#9CA3AF" }}>SERVICES & REFRESH</span>
                <button onClick={() => setActiveServices(
                  activeServices.length === Object.keys(SERVICE_CONFIG).length ? [] : Object.keys(SERVICE_CONFIG)
                )} style={{ fontSize: 10, color: "#9CA3AF", background: "transparent", border: "none", cursor: "pointer" }}>
                  {activeServices.length === Object.keys(SERVICE_CONFIG).length ? "none" : "all"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>All:</span>
                {REFRESH_OPTIONS.map(opt => (
                  <button key={opt.label} onClick={() => setGlobal(opt.ms)} style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
                    border: `1px solid ${globalRate === opt.ms ? "#7C3AED" : "#1F2937"}`,
                    background: globalRate === opt.ms ? "#2D1B6B" : "transparent",
                    color: globalRate === opt.ms ? "#A78BFA" : "#6B7280",
                    fontFamily: "Inter,sans-serif", fontWeight: 600 }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {Object.entries(SERVICE_CONFIG).map(([svc, cfg]) => (
                <div key={svc} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                  <button onClick={() => setActiveServices(prev =>
                    prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
                  )} style={{
                    width: 13, height: 13, borderRadius: 3, marginTop: 9, flexShrink: 0, padding: 0,
                    border: `1.5px solid ${activeServices.includes(svc) ? cfg.color : "#374151"}`,
                    background: activeServices.includes(svc) ? cfg.color + "33" : "transparent",
                    cursor: "pointer" }} />
                  <div style={{ flex: 1 }}>
                    <RefreshControl
                      svcKey={svc}
                      refreshRate={refreshRates[svc] ?? null}
                      onRateChange={ms => { setGlobalRate(null); setRate(svc, ms); }}
                      status={statuses[svc] ?? "idle"}
                      lastFetched={lastFetched[svc]}
                      onNow={() => fetchSvc(svc)} />
                  </div>
                </div>
              ))}
            </div>

            {/* Scoring Params */}
            <div style={{ borderTop: "1px solid #111827", paddingTop: 11 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11,
                  letterSpacing: "0.1em", color: "#9CA3AF" }}>SCORING — {profile.name.toUpperCase()}</span>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                  {params.filter(p => p.enabled && p.weight > 0).length} active
                </span>
              </div>
              {params.map(p => (
                <ParamSlider key={p.id} param={p}
                  onChange={u => setParams(prev => prev.map(x => x.id === u.id ? u : x))} />
              ))}
            </div>

            {/* Type filter */}
            <div style={{ marginTop: 11 }}>
              <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase",
                letterSpacing: "0.07em", fontWeight: 600, marginBottom: 6 }}>Content Type</div>
              <div style={{ display: "flex", gap: 5 }}>
                {["all", "series", "movie"].map(t => (
                  <button key={t} onClick={() => setFilterType(t)} style={{
                    padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                    border: `1px solid ${filterType === t ? "#7C3AED" : "#1F2937"}`,
                    background: filterType === t ? "#2D1B6B" : "transparent",
                    color: filterType === t ? "#A78BFA" : "#6B7280", cursor: "pointer" }}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Dismissed */}
            {dismissed.size > 0 && (
              <div style={{ marginTop: 11, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>{dismissed.size} title{dismissed.size !== 1 ? "s" : ""} hidden</span>
                <button onClick={restoreDismissed} style={{ fontSize: 10, color: "#A78BFA",
                  background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  restore all
                </button>
              </div>
            )}

            {/* Error log */}
            {errorLog.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid #111827", paddingTop: 10 }}>
                <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 600, letterSpacing: "0.07em", marginBottom: 5 }}>ERRORS</div>
                {errorLog.map((e, i) => (
                  <div key={i} style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter,sans-serif", marginBottom: 3, lineHeight: 1.5 }}>
                    <span style={{ color: "#EF4444" }}>{SERVICE_CONFIG[e.svc]?.label}</span>
                    {" "}{e.t}: {e.msg.slice(0, 100)}
                  </div>
                ))}
                <button onClick={() => setErrorLog([])} style={{ fontSize: 10, color: "#6B7280",
                  background: "transparent", border: "none", cursor: "pointer", marginTop: 2 }}>clear</button>
              </div>
            )}
          </div>

          {/* ── Main Canvas ── */}
          <div style={{ flex: 1, padding: "13px 16px", overflowY: "auto" }}>
            {serverOk === false && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "60vh", gap: 14, textAlign: "center" }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28,
                  color: "#4B5563", letterSpacing: "0.05em" }}>SERVER NOT RUNNING</div>
                <div style={{ fontSize: 13, color: "#9CA3AF", lineHeight: 1.8, maxWidth: 380 }}>
                  In your terminal, from the <code style={{ background: "#1F2937", padding: "1px 5px", borderRadius: 3 }}>streamrank/</code> folder, run:
                  <br /><br />
                  <code style={{ background: "#111827", border: "1px solid #1F2937", padding: "8px 16px",
                    borderRadius: 6, display: "inline-block", color: "#A78BFA", fontSize: 13 }}>npm run dev</code>
                </div>
              </div>
            )}

            {serverOk === true && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17,
                      letterSpacing: "0.05em", color: "#E5E7EB" }}>{scored.length} TITLES</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 7 }}>
                      ranked for {profile.name}
                      {minScore > 0 && consolidated.length > scored.length && (
                        <span style={{ marginLeft: 5, color: "#6B7280" }}>
                          ({consolidated.length - scored.length} filtered below {minScore})
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>Min score:</span>
                      {[0, 25, 40, 60].map(n => (
                        <button key={n} onClick={() => setMinScore(n)} style={{
                          padding: "2px 7px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                          border: `1px solid ${minScore === n ? "#7C3AED" : "#1F2937"}`,
                          background: minScore === n ? "#2D1B6B" : "transparent",
                          color: minScore === n ? "#A78BFA" : "#6B7280", cursor: "pointer" }}>
                          {n === 0 ? "All" : n + "+"}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>Sort:</span>
                      {[["score", "My Score"], ["rating", "API Rating"]].map(([val, lbl]) => (
                        <button key={val} onClick={() => setSortBy(val)} style={{
                          padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                          border: `1px solid ${sortBy === val ? "#7C3AED" : "#1F2937"}`,
                          background: sortBy === val ? "#2D1B6B" : "transparent",
                          color: sortBy === val ? "#A78BFA" : "#6B7280", cursor: "pointer" }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {anyLoading && scored.length === 0 && (
                  <div style={{ textAlign: "center", padding: "50px 0",
                    fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "#4B5563",
                    letterSpacing: "0.05em", animation: "pulse 1.2s infinite" }}>
                    FETCHING CATALOGS…
                  </div>
                )}
                {!anyLoading && scored.length === 0 && totalRaw > 0 && (
                  <div style={{ textAlign: "center", padding: "40px 0",
                    fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "#4B5563",
                    letterSpacing: "0.05em" }}>
                    NO MATCHES — TRY ADJUSTING FILTERS OR ENABLING MORE SERVICES
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {scored.map(({ item, score }, i) => (
                    <ContentCard
                      key={item.groupKey}
                      item={item}
                      score={score}
                      rank={i + 1}
                      onDismiss={() => dismiss(item)}
                      tmdb={tmdbCache[item.groupKey] ?? null}
                    />
                  ))}
                </div>

                {scored.length > 0 && <AIInsight params={params} scored={scored} profileName={profile.name} />}

                <div style={{ marginTop: 14, textAlign: "center", fontSize: 10, color: "#4B5563", paddingBottom: 20 }}>
                  Streaming data:{" "}
                  <a href="https://www.movieofthenight.com/about/api" target="_blank"
                    rel="noopener noreferrer" style={{ color: "#6B7280" }}>
                    Streaming Availability API by Movie of the Night
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
