import type { ResolvedMedia } from "../src/components.tsx";

/** A photo from Picsum, the same one for the same seed, at the size asked for. */
export const photo = (seed: string, width = 1600, height = 1067): ResolvedMedia => ({
  src: `https://picsum.photos/seed/${seed}/${width}/${height}`,
  width,
  height,
});

/** Photos the lab's scenes and fixtures show, by media ID. */
export const labMedia = new Map<string, ResolvedMedia>([["med_harbour", photo("harbour-sail")]]);
