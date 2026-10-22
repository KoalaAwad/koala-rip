// Loads the JSON data files and joins rankings with per-game info (Steam, OpenCritic, art).
import fs from "node:fs";
import path from "node:path";
import rankingsJson from "../../data/rankings.json";
import gamesJson from "../../data/games.json";
import profileJson from "../../data/profile.json";

export type RankEntry = { rank: number; title: string; score: number; review: string | null };
export type GameInfo = {
  title: string;
  appid?: number | null;
  reviewDesc?: string | null;
  reviewPct?: number | null;
  reviewTotal?: number | null;
  metacritic?: number | null;
  opencritic?: number | null;
  opencriticTier?: string | null;
  cover?: string | null;
  header?: string | null;
  screens?: string[];
};

export const rankings = rankingsJson as Record<string, RankEntry[]>;
export const profile = profileJson;
const games = gamesJson as Record<string, GameInfo>;

export const years = Object.keys(rankings).sort((a, b) => Number(b) - Number(a));

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");

// "cover" is 300x450 (fine for thumbnails); "cover2x" is 600x900 for large use.
export const steamArt = (appid: number, kind: "hero" | "cover" | "cover2x") =>
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/${{ hero: "library_hero.jpg", cover: "library_600x900.jpg", cover2x: "library_600x900_2x.jpg" }[kind]}`;

// Manually added art: drop public/covers/<slug>.jpg|png|webp (portrait) or public/covers/<slug>-hero.* (wide).
function localArt(title: string, suffix = "") {
  for (const ext of ["jpg", "png", "webp"]) {
    const file = `${slugify(title)}${suffix}.${ext}`;
    if (fs.existsSync(path.join(process.cwd(), "public", "covers", file))) return `/covers/${file}`;
  }
  return null;
}

export function gameInfo(title: string): GameInfo {
  return games[title] ?? { title };
}

export function coverFor(title: string) {
  const g = gameInfo(title);
  return localArt(title) ?? g.cover ?? g.header ?? null;
}

export function heroArtFor(title: string) {
  const g = gameInfo(title);
  return localArt(title, "-hero") ?? (g.appid ? steamArt(g.appid, "hero") : null);
}

/** Steam's own colour bands: any "Positive" is blue, "Mixed" is tan, anything negative is rust. */
export function sentiment(desc?: string | null) {
  if (!desc) return "";
  if (/Positive/.test(desc)) return "pos";
  if (/Mixed/.test(desc)) return "mix";
  return "neg";
}

export function critic(g: GameInfo) {
  if (g.opencritic) return { source: "OpenCritic", score: g.opencritic };
  if (g.metacritic) return { source: "Metacritic", score: g.metacritic };
  return null;
}

// Store names vary in case and symbols ("DAVE THE DIVER", "DARK SOULS™ III"), so match loosely.
const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The ranked entry for a game (any year), matched loosely by title. */
export function rankedEntry(title: string) {
  for (const y of years) {
    const hit = rankings[y].find((e) => loose(e.title) === loose(title));
    if (hit) return hit;
  }
  return null;
}

export const scoreFor = (title: string) => rankedEntry(title)?.score ?? null;

/** Prefer the title as written in the rankings over the store's spelling. */
export const displayTitle = (title: string) => rankedEntry(title)?.title ?? title;

// ---- Achievements page ----

export type ProgressRow = {
  title: string;
  cover: string | null;
  fallback: string | null;
  earned: number;
  total: number;
  percent: number;
  complete: boolean; // Steam 100% or PSN platinum
};

const byCompletion = (a: ProgressRow, b: ProgressRow) =>
  Number(b.complete) - Number(a.complete) || b.percent - a.percent || b.earned - a.earned || a.title.localeCompare(b.title);

const MIN_STEAM_MINUTES = 180; // games played under 3 hours are left off the achievements board

/** Steam games with 3h+ playtime and at least one unlocked achievement, 100% games first. Built from data/steam-cache.json. */
export function steamProgress(): ProgressRow[] {
  const file = path.join(process.cwd(), "data", "steam-cache.json");
  if (!fs.existsSync(file)) return [];
  const cache = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, { name: string; total: number; earned: number; minutes: number }>;
  return Object.entries(cache)
    .filter(([, g]) => g.total > 0 && g.earned > 0 && g.minutes >= MIN_STEAM_MINUTES)
    .map(([appid, g]) => ({
      title: g.name,
      cover: localArt(g.name) ?? steamArt(Number(appid), "cover"),
      fallback: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
      earned: g.earned,
      total: g.total,
      percent: Math.floor((100 * g.earned) / g.total),
      complete: g.earned === g.total,
    }))
    .sort(byCompletion);
}

/** PlayStation games from data/psn.json (written by the PSN sync), platinums first.
 *  Same 3-hour rule as Steam where PlayStation reports playtime (PS4/PS5); older platforms have none and are kept. */
export function psnProgress(): ProgressRow[] {
  const file = path.join(process.cwd(), "data", "psn.json");
  if (!fs.existsSync(file)) return [];
  const games = JSON.parse(fs.readFileSync(file, "utf8")) as {
    title: string; cover: string | null; progress: number; earned: number; total: number; platinum: boolean; minutes: number | null;
  }[];
  return games
    .filter((g) => g.minutes === null || g.minutes >= MIN_STEAM_MINUTES)
    .map((g) => ({ title: g.title, cover: localArt(g.title) ?? g.cover, fallback: null, earned: g.earned, total: g.total, percent: g.progress, complete: g.platinum }))
    .sort(byCompletion);
}

export type Completion = {
  title: string; platform: string; date: string; earned: number; total: number;
  hours: number | null; rarestPercent: number | null; appid?: number; hero?: string | null;
};

/** The newest completion across platforms: a Steam 100% or a PlayStation platinum. */
export function latestCompletion(): Completion | null {
  const all = Object.values((profileJson as { completions?: Record<string, Completion | null> }).completions ?? {}).filter(Boolean) as Completion[];
  return all.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

/** Every finished game (PlayStation platinums and Steam 100%s), newest first, with a large portrait cover. */
export function finishedGames(): { title: string; platform: "PlayStation" | "Steam"; cover: string | null; when: string }[] {
  const out: { title: string; platform: "PlayStation" | "Steam"; cover: string | null; when: string }[] = [];
  const steamFile = path.join(process.cwd(), "data", "steam-cache.json");
  if (fs.existsSync(steamFile)) {
    const cache = JSON.parse(fs.readFileSync(steamFile, "utf8")) as Record<string, { name: string; total: number; earned: number; lastUnlock: number }>;
    for (const [appid, g] of Object.entries(cache)) {
      if (g.total > 0 && g.earned === g.total) {
        const title = displayTitle(g.name);
        out.push({ title, platform: "Steam", cover: localArt(title) ?? steamArt(Number(appid), "cover2x"), when: new Date(g.lastUnlock * 1000).toISOString() });
      }
    }
  }
  const psnFile = path.join(process.cwd(), "data", "psn.json");
  if (fs.existsSync(psnFile)) {
    const rows = JSON.parse(fs.readFileSync(psnFile, "utf8")) as { title: string; cover: string | null; platinum: boolean; lastUpdated: string }[];
    for (const r of rows.filter((r) => r.platinum)) {
      out.push({ title: r.title, platform: "PlayStation", cover: localArt(r.title) ?? resizePsnUrl(r.cover, 600), when: r.lastUpdated });
    }
  }
  return out.sort((a, b) => b.when.localeCompare(a.when));
}

const resizePsnUrl = (url: string | null, w: number) => (url ? url.replace(/\?w=\d+$/, `?w=${w}`) : null);

/** How many Steam games have any playtime (from the sync cache). */
export function steamPlayedCount(): number {
  const file = path.join(process.cwd(), "data", "steam-cache.json");
  return fs.existsSync(file) ? Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))).length : 0;
}

// ---- Stage pictures (the fixed half of the homepage) ----

const psnRows = (() => {
  const file = path.join(process.cwd(), "data", "psn.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as { title: string; cover: string | null; hero: string | null }[]) : [];
})();

const resizePsn = (url: string | null, w: number) => (url ? url.replace(/\?w=\d+$/, `?w=${w}`) : null);

/** A large portrait picture of a game, for the stage: local art, Steam library art, or PlayStation portrait art. */
export function portraitFor(title: string): string | null {
  const local = localArt(title);
  if (local) return local;
  const g = gameInfo(title);
  if (g.appid) return steamArt(g.appid, "cover2x");
  const p = psnRows.find((r) => loose(r.title) === loose(title));
  return p ? resizePsn(p.cover, 1200) : null;
}

/** A wide picture of a game (banners, footer crop). */
export function wideFor(title: string, appid?: number, hero?: string | null): string | null {
  if (hero) return hero;
  if (appid) return steamArt(appid, "hero");
  const local = localArt(title, "-hero");
  if (local) return local;
  const g = gameInfo(title);
  if (g.appid) return steamArt(g.appid, "hero");
  const p = psnRows.find((r) => loose(r.title) === loose(title));
  return p?.hero ?? null;
}

/** Portrait for the latest completion (it may not be in the rankings). */
export function completionPortrait(c: Completion): string | null {
  if (c.appid) return localArt(displayTitle(c.title)) ?? steamArt(c.appid, "cover2x");
  return portraitFor(c.title);
}

export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
