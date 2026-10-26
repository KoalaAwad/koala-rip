// Image optimization: every picture on the site goes through here at build time.
// Astro downloads it (Steam/PlayStation art) or reads it (src/assets/covers), resizes it to the size it is
// actually shown at, converts it to WebP, and serves it from koala.rip itself.
import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

const localFiles = import.meta.glob<{ default: ImageMetadata }>("/src/assets/covers/*.{png,jpg,jpeg,webp}", { eager: true });
const local: Record<string, ImageMetadata> = Object.fromEntries(
  Object.entries(localFiles).map(([p, m]) => [p.split("/").pop()!, m.default]),
);

export type OptimizedImage = { src: string; srcset?: string; width: number; height: number };

type Options = {
  /** Pixel-density variants for fixed-size images (thumbnails). Default [1, 2]. */
  densities?: number[];
  /** Width variants for fluid images (banners), used with `sizes`. */
  widths?: number[];
  quality?: number;
};

const cache = new Map<string, Promise<OptimizedImage | null>>();

/**
 * Returns an optimized version of `src` displayed `width` CSS pixels wide (aspect ratio kept).
 * `src` is a remote URL or a "/covers/<file>" path from data.ts. Returns null when the image
 * can't be fetched (e.g. a Steam URL that doesn't exist), so callers can show the placeholder.
 */
export function optimize(src: string | null | undefined, width: number, opts: Options = {}): Promise<OptimizedImage | null> {
  if (!src) return Promise.resolve(null);
  const key = `${src}|${width}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const file = src.startsWith("/covers/") ? local[src.slice("/covers/".length)] : undefined;
        if (src.startsWith("/covers/") && !file) return null;
        const variants = opts.widths ? { widths: opts.widths } : { densities: opts.densities ?? [1, 2] };
        const img = await getImage({
          src: file ?? src,
          width,
          format: "webp",
          quality: opts.quality ?? 78,
          ...(file ? {} : { inferSize: true }),
          ...variants,
        });
        return {
          src: img.src,
          srcset: img.srcSet?.attribute || undefined,
          width: Number(img.attributes.width),
          height: Number(img.attributes.height),
        };
      } catch (e) {
        console.warn(`[img] skipped ${src}: ${(e as Error).message}`);
        return null;
      }
    })());
  }
  return cache.get(key)!;
}

/** First of several candidate sources that can actually be loaded. */
export async function optimizeFirst(srcs: (string | null | undefined)[], width: number, opts: Options = {}) {
  for (const s of srcs) {
    const img = await optimize(s, width, opts);
    if (img) return img;
  }
  return null;
}
