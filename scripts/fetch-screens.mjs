// Adds up to four Steam store screenshots per ranked game to data/games.json (field: screens).
// Usage: node scripts/fetch-screens.mjs [--force]   (no key needed)
import fs from "node:fs";

const force = process.argv.includes("--force");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const games = JSON.parse(fs.readFileSync("data/games.json", "utf8"));

for (const g of Object.values(games)) {
  if (!g.appid || (g.screens && !force)) continue;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${g.appid}&filters=screenshots`);
      if (r.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
      const d = await r.json();
      g.screens = (d?.[g.appid]?.data?.screenshots ?? []).slice(0, 4).map((s) => s.path_full.split("?")[0]);
      console.log(`${g.title}: ${g.screens.length}`);
      break;
    } catch (e) {
      await sleep(3000);
    }
  }
  await sleep(400);
}
fs.writeFileSync("data/games.json", JSON.stringify(games, null, 2) + "\n");
