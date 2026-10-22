// Downloads cover art from SteamGridDB for ranked games that Steam has no art for (e.g. Switch games).
// Saves public/covers/<slug>.<ext> (portrait 600x900) and <slug>-hero.<ext> (wide banner); the site picks them up automatically.
// Usage: node --env-file=.env scripts/fetch-covers.mjs [--force]
// Get a free key at https://www.steamgriddb.com/profile/preferences/api (sign in with Steam).
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.SGDB_API_KEY;
if (!KEY) { console.error("SGDB_API_KEY is not set (see .env.example)."); process.exit(1); }
const force = process.argv.includes("--force");
const OUT = "public/covers";

// Must match slugify() in src/lib/data.ts
const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");

async function sgdb(p) {
  const r = await fetch(`https://www.steamgriddb.com/api/v2${p}`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${p}`);
  return (await r.json()).data;
}

async function download(url, base) {
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(path.join(OUT, base + ext), Buffer.from(await r.arrayBuffer()));
  return base + ext;
}

const exists = (base) => ["jpg", "jpeg", "png", "webp"].some((e) => fs.existsSync(path.join(OUT, `${base}.${e}`)));

const rankings = JSON.parse(fs.readFileSync("data/rankings.json", "utf8"));
const games = JSON.parse(fs.readFileSync("data/games.json", "utf8"));
const titles = [...new Set(Object.values(rankings).flat().map((e) => e.title))];
// Extra titles can be passed on the command line (e.g. PlayStation games with only square art).
const extra = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const missing = [...titles.filter((t) => !games[t]?.cover && !games[t]?.header), ...extra];

fs.mkdirSync(OUT, { recursive: true });
console.log(`${missing.length} game(s) without Steam art: ${missing.join(", ") || "none"}`);

for (const title of missing) {
  const slug = slugify(title);
  if (!force && exists(slug) && exists(`${slug}-hero`)) { console.log(`${title}: already has art`); continue; }
  try {
    const [hit] = await sgdb(`/search/autocomplete/${encodeURIComponent(title)}`);
    if (!hit) { console.log(`${title}: not found on SteamGridDB`); continue; }
    const [grid] = await sgdb(`/grids/game/${hit.id}?dimensions=600x900&types=static`);
    const [hero] = await sgdb(`/heroes/game/${hit.id}?types=static`);
    const saved = [];
    if (grid && (force || !exists(slug))) saved.push(await download(grid.url, slug));
    if (hero && (force || !exists(`${slug}-hero`))) saved.push(await download(hero.url, `${slug}-hero`));
    console.log(`${title} -> "${hit.name}": ${saved.join(", ") || "no images available"}`);
  } catch (e) {
    console.error(`${title}: ${e.message}`);
  }
}
