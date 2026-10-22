// Pulls PlayStation trophy progress and writes data/psn.json plus the PSN parts of data/profile.json.
// Usage: node --env-file=.env scripts/sync-psn.mjs
//
// Uses the unofficial PlayStation API via psn-api. Auth comes from PSN_NPSSO (a login cookie that lasts ~2 months).
// When it expires this script exits with a clear message; grab a new one from https://ca.account.sony.com/api/v1/ssocookie.
import fs from "node:fs";
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getUserPlayedGames,
  getUserTrophiesEarnedForTitle,
} from "psn-api";

const NPSSO = process.env.PSN_NPSSO;
if (!NPSSO) { console.error("PSN_NPSSO is not set (see .env.example)."); process.exit(1); }

let auth;
try {
  auth = await exchangeAccessCodeForAuthTokens(await exchangeNpssoForAccessCode(NPSSO));
} catch (e) {
  console.error("PSN login failed: the NPSSO token has probably expired.");
  console.error("Sign in at playstation.com, open https://ca.account.sony.com/api/v1/ssocookie and update PSN_NPSSO.");
  process.exit(2);
}

const loose = (s) => s.toLowerCase().replace(/\b(trophies|trophy set)\b/g, "").replace(/[^a-z0-9]/g, "");
const sized = (url, w) => (url && url.includes("image.api.playstation.com") ? `${url}?w=${w}` : url);
const minutesOf = (iso) => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?/.exec(iso ?? "");
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : null;
};

async function all(fetchPage, key) {
  const out = [];
  for (let offset = 0; ; ) {
    const page = await fetchPage({ limit: 200, offset });
    out.push(...page[key]);
    offset += page[key].length;
    if (!page[key].length || offset >= page.totalItemCount) return out;
  }
}

const titles = await all((o) => getUserTitles(auth, "me", o), "trophyTitles");
const played = await all((o) => getUserPlayedGames(auth, "me", o), "titles");
console.log(`${titles.length} trophy lists, ${played.length} played games`);

// Played-games entries carry playtime and proper art; match them to trophy lists by name.
const playedByName = new Map();
for (const g of played) {
  const k = loose(g.name);
  const prev = playedByName.get(k);
  if (!prev || minutesOf(g.playDuration) > minutesOf(prev.playDuration)) playedByName.set(k, g);
}
const image = (g, ...types) => {
  for (const t of types) {
    const hit = g?.concept?.media?.images?.find((i) => i.type === t) ?? g?.media?.images?.find((i) => i.type === t);
    if (hit) return hit.url;
  }
  return null;
};

const sum = (o) => o.bronze + o.silver + o.gold + o.platinum;
const rows = titles
  .filter((t) => t.progress > 0)
  .map((t) => {
    const g = playedByName.get(loose(t.trophyTitleName));
    return {
      title: g?.name ?? t.trophyTitleName.replace(/\s+trophies$/i, ""),
      platform: t.trophyTitlePlatform,
      // portrait art, else the square game tile (crops better into a portrait slot than wide banners)
      cover: sized(image(g, "PORTRAIT_BANNER") ?? g?.imageUrl, 240) ?? t.trophyTitleIconUrl,
      hero: sized(image(g, "GAMEHUB_COVER_ART", "MASTER", "FOUR_BY_THREE_BANNER"), 1920),
      progress: t.progress,
      earned: sum(t.earnedTrophies),
      total: sum(t.definedTrophies),
      platinum: t.earnedTrophies.platinum > 0,
      minutes: g ? minutesOf(g.playDuration) : null,
      lastUpdated: t.lastUpdatedDateTime,
      npCommunicationId: t.npCommunicationId,
      npServiceName: t.npServiceName,
    };
  });

// Latest platinum: check the few most recently updated platinum lists for the real platinum unlock date.
const platinumRows = rows.filter((r) => r.platinum).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
let latest = null;
for (const r of platinumRows.slice(0, 5)) {
  const { trophies } = await getUserTrophiesEarnedForTitle(auth, "me", r.npCommunicationId, "all", { npServiceName: r.npServiceName });
  const plat = trophies.find((t) => t.trophyType === "platinum" && t.earned);
  if (!plat) continue;
  const rates = trophies.filter((t) => t.earned && t.trophyEarnedRate).map((t) => Number(t.trophyEarnedRate));
  const candidate = { ...r, platDate: plat.earnedDateTime, rarest: rates.length ? Math.min(...rates) : null };
  if (!latest || candidate.platDate > latest.platDate) latest = candidate;
}

fs.writeFileSync("data/psn.json", JSON.stringify(rows, null, 2) + "\n");

const profile = JSON.parse(fs.readFileSync("data/profile.json", "utf8"));
profile.lastSynced = new Date().toISOString();
profile.sources = { ...(profile.sources ?? {}), psn: true };
profile.stats.platinums = platinumRows.length;
profile.stats.latestPlatinum = latest ? { title: latest.title, date: latest.platDate.slice(0, 10) } : null;
profile.completions = { ...(profile.completions ?? {}) };
profile.completions.psn = latest
  ? {
      title: latest.title,
      platform: "PlayStation",
      date: latest.platDate.slice(0, 10),
      earned: latest.earned,
      total: latest.total,
      hours: latest.minutes !== null ? Math.round(latest.minutes / 60) : null,
      rarestPercent: latest.rarest !== null ? (latest.rarest < 10 ? Math.round(latest.rarest * 10) / 10 : Math.round(latest.rarest)) : null,
      hero: latest.hero,
    }
  : null;
fs.writeFileSync("data/profile.json", JSON.stringify(profile, null, 2) + "\n");

console.log(`Games with trophies: ${rows.length}`);
console.log(`Platinums: ${platinumRows.length}`);
console.log(latest ? `Latest platinum: ${latest.title} on ${latest.platDate.slice(0, 10)}` : "No platinums found");
