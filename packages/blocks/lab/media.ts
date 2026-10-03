import type { ResolvedMedia } from "../src/components.tsx";

/** A photo from Picsum, the same one for the same seed, at the size asked for. */
export const photo = (seed: string, width = 1600, height = 1067): ResolvedMedia => ({
  src: `https://picsum.photos/seed/${seed}/${width}/${height}`,
  width,
  height,
});

/** Photos the lab's scenes and fixtures show, by media ID. */
export const labMedia = new Map<string, ResolvedMedia>([
  ["med_harbour", photo("harbour-sail")],
  ["med_screen", photo("dashboard-screen", 2400, 1500)],
  ["med_office", photo("team-office", 1200, 1500)],
  ["med_wide1", photo("wide-one", 2000, 1200)],
  ["med_wide2", photo("wide-two", 2000, 1200)],
  ["med_wide3", photo("wide-three", 2000, 1200)],
  ["med_tall1", photo("tall-one", 1200, 1500)],
  ["med_tall2", photo("tall-two", 1200, 1500)],
  ["med_tall3", photo("tall-three", 1200, 1500)],
  ["med_tall4", photo("tall-four", 1200, 1500)],
  ["med_square1", photo("square-one", 1200, 1200)],
  ["med_square2", photo("square-two", 1200, 1200)],
  ["med_square3", photo("square-three", 1200, 1200)],
  ["med_square4", photo("square-four", 1200, 1200)],
]);

/** A portrait of a real-looking person, from randomuser.me, for people blocks. */
const face = (gender: "men" | "women", n: number): ResolvedMedia => ({
  src: `https://randomuser.me/api/portraits/${gender}/${n}.jpg`,
  width: 512,
  height: 512,
});

for (const [index, seed] of ["a", "b", "c", "d", "e", "f", "g", "h"].entries()) {
  labMedia.set(`med_photo${seed}`, photo(`pakshi-${seed}`, 1800, 1200));
  labMedia.set(`med_tall${seed}`, photo(`pakshi-tall-${seed}`, 1200, 1500));
  labMedia.set(`med_face${seed}`, face(index % 2 === 0 ? "women" : "men", 20 + index * 7));
}
