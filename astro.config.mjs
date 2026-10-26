// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://koala.rip",
  // Remote game art that Astro may download and optimize at build time
  image: {
    remotePatterns: [
      { protocol: "https", hostname: "shared.akamai.steamstatic.com" },
      { protocol: "https", hostname: "**.steamstatic.com" },
      { protocol: "https", hostname: "image.api.playstation.com" },
      { protocol: "https", hostname: "psnobj.prod.dl.playstation.net" },
    ],
  },
  vite: {
    // Files are often edited from the Windows side of WSL, which inotify doesn't see; poll instead.
    server: { watch: { usePolling: true, interval: 300 } },
  },
});
