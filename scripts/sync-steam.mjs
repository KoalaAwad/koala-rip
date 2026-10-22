// Pulls Steam achievement data and writes the Steam parts of data/profile.json.
// Usage: node --env-file=.env scripts/sync-steam.mjs [--full]
//
// Per-game results are cached in data/steam-cache.json and a game is only re-fetched when its
// "last played" time changes, so after the first run a sync takes a few seconds.
import fs from "node:fs";

const KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID || "76561198069229314";
if (!KEY) { console.error("STEAM_API_KEY is not set (see .env.example)."); process.exit(1); }

const CACHE_PATH = "data/steam-cache.json";
const PROFILE_PATH = "data/profile.json";
const full = process.argv.includes("--full");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, params, { allow400 = false } = {}) {
  const qs = new URLSearchParams({ key: KEY, format: "json", ...params });
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://api.steampowered.com/${path}?${qs}`);
    if (r.ok) return r.json();
    if ((r.status === 400 || r.status === 403) && allow400) return null; // e.g. "Requested app has no stats"
    if ((r.status === 429 || r.status >= 500) && attempt < (allow400 ? 2 : 4)) { await sleep(2000 * (attempt + 1)); continue; }
    // Some apps (delisted, tools, odd stat setups) answer per-game calls with a persistent 500: treat as "no data".
    if (allow400) { console.warn(`  skipped ${params.appid ?? params.gameid}: HTTP ${r.status}`); return null; }
    throw new Error(`${r.status} ${path}`);
  }
}

const cache = fs.existsSync(CACHE_PATH) && !full ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : {};

// 1. Owned games
const owned = await api("IPlayerService/GetOwnedGames/v1/", {
  steamid: STEAM_ID, include_appinfo: "1", include_played_free_games: "1",
});
const games = (owned?.response?.games ?? []).filter((g) => g.playtime_forever > 0);
if (!games.length) { console.error("No played games returned. Is the profile's game details setting public?"); process.exit(1); }
console.log(`${games.length} played games`);

// 2. Achievements per game (only games whose last-played time changed since the cached run)
let fetched = 0;
for (const g of games) {
  const c = cache[g.appid];
  if (c && c.lastPlayed === g.rtime_last_played) { c.minutes = g.playtime_forever; continue; }

  const pa = await api("ISteamUserStats/GetPlayerAchievements/v1/", { steamid: STEAM_ID, appid: g.appid }, { allow400: true });
  const list = pa?.playerstats?.achievements ?? [];
  const entry = { name: g.name, lastPlayed: g.rtime_last_played, minutes: g.playtime_forever, total: list.length, earned: 0, lastUnlock: 0, rarest: null };

  if (list.length) {
    const got = list.filter((a) => a.achieved === 1);
    entry.earned = got.length;
    entry.lastUnlock = Math.max(0, ...got.map((a) => a.unlocktime));
    if (got.length) {
      const gp = await api("ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/", { gameid: g.appid }, { allow400: true });
      const pct = new Map((gp?.achievementpercentages?.achievements ?? []).map((a) => [a.name, Number(a.percent)]));
      const rarities = got.map((a) => pct.get(a.apiname)).filter((p) => Number.isFinite(p));
      entry.rarest = rarities.length ? Math.min(...rarities) : null;
    }
  }
  cache[g.appid] = entry;
  fetched++;
  if (fetched % 25 === 0) { console.log(`  fetched ${fetched}…`); fs.writeFileSync(CACHE_PATH, JSON.stringify(cache)); }
  await sleep(150);
}
fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
console.log(`fetched ${fetched} games, ${games.length - fetched} from cache`);

// 3. Summarise
const entries = Object.entries(cache).map(([appid, e]) => ({ appid: Number(appid), ...e }));
const perfect = entries.filter((e) => e.total > 0 && e.earned === e.total);
const steamAchievements = entries.reduce((n, e) => n + e.earned, 0);
const rarestOverall = entries.filter((e) => e.rarest !== null).sort((a, b) => a.rarest - b.rarest)[0];
const latest = perfect.sort((a, b) => b.lastUnlock - a.lastUnlock)[0];

const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
profile.lastSynced = new Date().toISOString();
profile.sources = { ...(profile.sources ?? {}), steam: true };
profile.stats.steamAchievements = steamAchievements;
profile.stats.perfectGames = perfect.length;
profile.stats.rarestSteam = rarestOverall ? { title: rarestOverall.name, percent: round1(rarestOverall.rarest) } : null;
if (latest) {
  profile.latestCompletion = {
    title: latest.name,
    appid: latest.appid,
    platform: "Steam",
    date: new Date(latest.lastUnlock * 1000).toISOString().slice(0, 10),
    earned: latest.earned,
    total: latest.total,
    hours: Math.round(latest.minutes / 60),
    rarestPercent: latest.rarest !== null ? round1(latest.rarest) : null,
  };
}
fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + "\n");

console.log(`Steam achievements: ${steamAchievements}`);
console.log(`Games at 100%: ${perfect.length}`);
console.log(latest ? `Latest 100%: ${latest.name} on ${profile.latestCompletion.date}` : "No 100% games yet");

function round1(n) { return n < 10 ? Math.round(n * 10) / 10 : Math.round(n); }
