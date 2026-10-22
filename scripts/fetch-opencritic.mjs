// Adds OpenCritic "Top Critic Average" to data/games.json for every ranked game.
// Usage: RAPIDAPI_KEY=xxxx node scripts/fetch-opencritic.mjs [--force]
// Games that already have an OpenCritic score are skipped unless --force is passed,
// so the free tier's small daily quota goes a long way.
import fs from "node:fs";

const KEY = process.env.RAPIDAPI_KEY;
if (!KEY) { console.error("Set RAPIDAPI_KEY (your OpenCritic key from rapidapi.com)."); process.exit(1); }
const HOST = "opencritic-api.p.rapidapi.com";
const force = process.argv.includes("--force");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Titles that OpenCritic lists under a different name
const ALIASES = { "Resident Evil 9": "Resident Evil Requiem", "Deltarune: Chapters 3 & 4": "Deltarune" };

async function oc(path) {
  const r = await fetch(`https://${HOST}${path}`, { headers: { "x-rapidapi-key": KEY, "x-rapidapi-host": HOST } });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${await r.text()}`);
  return r.json();
}

const rankings = JSON.parse(fs.readFileSync("data/rankings.json", "utf8"));
const games = JSON.parse(fs.readFileSync("data/games.json", "utf8"));
const titles = [...new Set(Object.values(rankings).flat().map(e => e.title))];

for (const title of titles) {
  const g = games[title] ??= { title };
  if (g.opencriticId && !force) continue;
  const query = ALIASES[title] ?? title;
  try {
    const results = await oc(`/game/search?criteria=${encodeURIComponent(query)}`);
    const hit = results.find(r => norm(r.name) === norm(query)) ?? results[0];
    if (!hit) { console.log(`${title}: no OpenCritic match`); continue; }
    const d = await oc(`/game/${hit.id}`);
    g.opencriticId = hit.id;
    g.opencriticName = d.name;
    g.opencritic = d.topCriticScore > 0 ? Math.round(d.topCriticScore) : null;
    g.opencriticTier = d.tier ?? null;            // "Mighty", "Strong", "Fair", "Weak"
    g.opencriticRecommended = d.percentRecommended > 0 ? Math.round(d.percentRecommended) : null;
    console.log(`${title} -> ${d.name} (#${hit.id}): ${g.opencritic ?? "no score"} ${g.opencriticTier ?? ""}`);
  } catch (e) {
    console.error(`${title}: ${e.message}`);
    if (/\b429\b/.test(e.message)) { console.error("Daily quota reached; run again tomorrow to continue."); break; }
  }
  fs.writeFileSync("data/games.json", JSON.stringify(games, null, 2)); // save as we go
  await sleep(1200);
}
