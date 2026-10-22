import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// One Markdown file per review in src/content/reviews/. Files starting with "_" are ignored.
// A review is linked from the rankings automatically when its `game` matches a ranked title.
const reviews = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/reviews" }),
  schema: z.object({
    game: z.string(),
    score: z.number().min(0).max(10),
    date: z.coerce.date(),
    excerpt: z.string(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { reviews };
