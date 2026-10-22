# gaming-site

Personal site: trophies, yearly game rankings and reviews. Built with Astro, GSAP and Lenis.

## Run it

Inside WSL:

```bash
source ~/.nvm/nvm.sh
cd ~/Project/gaming-site
npm run dev      # http://localhost:4321
npm run build    # static site in dist/
```

## Where things live

| What | Where |
|---|---|
| Yearly rankings (title + score) | `data/rankings.json` |
| Per-game Steam / critic data and cover URLs | `data/games.json` |
| Profile stats and the "Latest 100%" banner | `data/profile.json` (placeholder until the sync exists) |
| Reviews | `src/content/reviews/*.md`, copy `_template.md` to start one |
| Manual cover art (non-Steam games) | `public/covers/<slug>.jpg` (portrait) and `<slug>-hero.jpg` (wide), e.g. `donkey-kong-bananza.jpg` |
| Design mocks | `design/` |

A ranking's score links to a review automatically when a published review's `game` matches the ranked title.

## Scripts

- `RAPIDAPI_KEY=... npm run fetch:opencritic`: adds OpenCritic Top Critic Averages to `data/games.json`.
