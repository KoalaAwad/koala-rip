// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://koala.rip",
  vite: {
    // Files are often edited from the Windows side of WSL, which inotify doesn't see; poll instead.
    server: { watch: { usePolling: true, interval: 300 } },
  },
});
