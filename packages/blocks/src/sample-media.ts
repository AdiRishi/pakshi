import { MediaId } from "@repo/contracts/ids";

import type { ResolvedMedia } from "./components.tsx";
import { inlineSvg, placeholderMedia } from "./placeholders.ts";

/*
 * Images that block samples show where the placeholder images don't fit:
 * people, a map and logos. Like the placeholders, they're drawn inline, so
 * they resolve anywhere without files.
 */

const portrait = (colors: {
  readonly background: string;
  readonly skin: string;
  readonly hair: string;
  readonly clothes: string;
  readonly long: boolean;
}) =>
  inlineSvg(
    800,
    800,
    `<rect width="800" height="800" fill="${colors.background}"/>` +
      (colors.long
        ? `<path d="M235 350C235 195 305 140 400 140S565 195 565 350V560H235Z" fill="${colors.hair}"/>`
        : "") +
      `<rect x="345" y="420" width="110" height="140" rx="40" fill="${colors.skin}"/>` +
      `<path d="M120 800C120 615 240 530 400 530S680 615 680 800Z" fill="${colors.clothes}"/>` +
      `<path d="M330 540L400 610L470 540" fill="none" stroke="${colors.skin}" stroke-width="34" stroke-linejoin="round"/>` +
      `<ellipse cx="400" cy="330" rx="135" ry="155" fill="${colors.skin}"/>` +
      `<path d="M262 320C255 215 315 160 400 160S548 215 538 320C510 255 465 228 400 228S292 255 262 320Z" fill="${colors.hair}"/>`,
  );

const map = inlineSvg(
  1200,
  900,
  `<rect width="1200" height="900" fill="#EFE6D6"/>` +
    `<path d="M0 600C170 585 300 640 410 735S540 900 540 900H0Z" fill="#BFD3D0"/>` +
    `<path d="M0 655C150 645 260 690 350 770" fill="none" stroke="#A9C3BF" stroke-width="6" stroke-linecap="round"/>` +
    `<rect x="760" y="110" width="300" height="190" rx="24" fill="#D5E0C6"/>` +
    `<circle cx="850" cy="190" r="34" fill="#C2D2B1"/><circle cx="960" cy="225" r="26" fill="#C2D2B1"/>` +
    `<g fill="#E4D8C4"><rect x="120" y="110" width="210" height="140" rx="12"/>` +
    `<rect x="380" y="110" width="300" height="140" rx="12"/><rect x="120" y="380" width="250" height="150" rx="12"/>` +
    `<rect x="720" y="400" width="190" height="170" rx="12"/><rect x="960" y="400" width="180" height="170" rx="12"/>` +
    `<rect x="640" y="640" width="260" height="170" rx="12"/><rect x="960" y="640" width="180" height="170" rx="12"/></g>` +
    `<g fill="none" stroke-linecap="round"><g stroke="#D9CDB8" stroke-width="46">` +
    `<path d="M0 320C320 300 640 345 1200 330"/><path d="M590 0C560 300 600 600 560 900"/>` +
    `<path d="M560 600C760 595 960 610 1200 600"/></g><g stroke="#FFFFFF" stroke-width="34">` +
    `<path d="M0 320C320 300 640 345 1200 330"/><path d="M590 0C560 300 600 600 560 900"/>` +
    `<path d="M560 600C760 595 960 610 1200 600"/></g></g>` +
    `<ellipse cx="455" cy="512" rx="34" ry="10" fill="#33302F" opacity=".2"/>` +
    `<path d="M455 510C455 510 375 420 375 368A80 80 0 0 1 535 368C535 420 455 510 455 510Z" fill="#C9724F"/>` +
    `<circle cx="455" cy="366" r="30" fill="#FFFFFF"/>`,
);

const wordmark = (mark: string, words: string) =>
  inlineSvg(400, 120, `<g fill="#33302F" stroke="#33302F">${mark}</g>${words}`);

const serif = `font-family="Georgia, 'Times New Roman', serif"`;
const sans = `font-family="'Helvetica Neue', Arial, sans-serif"`;

const harbourTrust = wordmark(
  `<circle cx="52" cy="60" r="38" fill="none" stroke-width="6"/>` +
    `<path d="M26 66q13-12 26 0t26 0" fill="none" stroke-width="6" stroke-linecap="round"/>`,
  `<text x="108" y="58" ${serif} font-size="32" fill="#33302F">Westbay</text>` +
    `<text x="110" y="88" ${sans} font-size="15" letter-spacing="4" fill="#33302F">HARBOUR TRUST</text>`,
);

const rowingClub = wordmark(
  `<path d="M22 98L82 22M82 98L22 22" fill="none" stroke-width="7" stroke-linecap="round"/>` +
    `<ellipse cx="28" cy="91" rx="9" ry="16" transform="rotate(38 28 91)" stroke="none"/>` +
    `<ellipse cx="76" cy="91" rx="9" ry="16" transform="rotate(-38 76 91)" stroke="none"/>`,
  `<text x="108" y="56" ${sans} font-size="26" font-weight="700" fill="#33302F">Westbay</text>` +
    `<text x="108" y="88" ${sans} font-size="22" fill="#33302F">Rowing Club</text>`,
);

const boatyard = wordmark(
  `<path d="M54 14V84L18 84Z" stroke="none"/><path d="M62 30V84L92 84Z" stroke="none"/>` +
    `<path d="M14 94H96L84 108H26Z" stroke="none"/>`,
  `<text x="112" y="62" ${sans} font-size="30" font-weight="800" letter-spacing="1" fill="#33302F">NORTH QUAY</text>` +
    `<text x="113" y="92" ${sans} font-size="16" letter-spacing="7" fill="#33302F">BOATYARD</text>`,
);

const artsCouncil = wordmark(
  `<circle cx="38" cy="44" r="24" stroke="none"/>` +
    `<circle cx="68" cy="44" r="24" fill="none" stroke-width="6"/>` +
    `<circle cx="53" cy="72" r="24" fill="none" stroke-width="6"/>`,
  `<text x="112" y="56" ${serif} font-size="28" font-style="italic" fill="#33302F">County Arts</text>` +
    `<text x="112" y="90" ${serif} font-size="28" font-style="italic" fill="#33302F">Council</text>`,
);

/**
 * A harbour at sunset in full colour, for samples that show a photo large.
 * The placeholder sea is drawn soft so a new block's photo sits quietly
 * under any brand, which reads as washed out where the photo is the point.
 */
const harbour = inlineSvg(
  1600,
  1067,
  `<defs><linearGradient id="sky" x2="0" y2="1"><stop offset="0" stop-color="#F5D9AE"/>` +
    `<stop offset=".45" stop-color="#CCD3C9"/><stop offset="1" stop-color="#9FC9E6"/></linearGradient>` +
    `<linearGradient id="water" x2="0" y2="1"><stop offset="0" stop-color="#2A6491"/>` +
    `<stop offset="1" stop-color="#14385A"/></linearGradient></defs>` +
    `<rect width="1600" height="640" fill="url(#sky)"/>` +
    `<circle cx="1280" cy="250" r="80" fill="#FCF1D3"/>` +
    `<rect y="640" width="1600" height="427" fill="url(#water)"/>` +
    `<path d="M0 700L260 600L520 680L780 590L1040 660L1300 610L1600 690V760H0Z" fill="#0F2D49"/>` +
    `<path d="M0 763H1600" stroke="#8FB4CF" stroke-width="4" opacity=".6"/>` +
    `<path d="M200 822H900M700 962H1500" stroke="#4E7EA6" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M450 852L552 660V852Z" fill="#F3EEE6"/><path d="M558 640L662 852H558Z" fill="#BE3A2B"/>` +
    `<rect x="548" y="630" width="8" height="232" fill="#3B2A20"/>` +
    `<path d="M420 860H700L660 910H460Z" fill="#F3EEE6"/>` +
    `<path d="M1040 892L1124 715V892Z" fill="#F3EEE6"/><path d="M1129 700L1216 892H1129Z" fill="#E4AF4D"/>` +
    `<rect x="1121" y="690" width="7" height="212" fill="#3B2A20"/>` +
    `<path d="M1020 900H1240L1210 940H1050Z" fill="#F3EEE6"/>`,
);

const image = (id: string, alt: string, media: ResolvedMedia) =>
  [MediaId.make(id), { ...media, alt }] as const;

const placeholder = (id: string, alt: string) => {
  const media = placeholderMedia.get(MediaId.make(id));
  if (media === undefined) throw new Error(`${id} is not a placeholder image.`);
  return image(id, alt, media);
};

/**
 * Every image a sample can show, with the alt text it suggests: the
 * placeholder images, and the harbour, people, map and logos drawn for samples.
 */
export const sampleMedia: ReadonlyMap<MediaId, ResolvedMedia & { readonly alt: string }> = new Map([
  placeholder("med_pakshiHills", "Hills above the harbour at sunset"),
  placeholder("med_pakshiCircles", "A painting of coloured circles"),
  placeholder("med_pakshiArch", "An open doorway with the sea beyond"),
  placeholder("med_pakshiSea", "Two sailing boats on the water"),
  placeholder("med_pakshiLogoCircle", "Logo"),
  placeholder("med_pakshiLogoSquare", "Logo"),
  placeholder("med_pakshiLogoTriangle", "Logo"),
  placeholder("med_pakshiLogoWave", "Logo"),
  image(
    "med_sampleTom",
    "Tom Penrose",
    portrait({
      background: "#E9DBC7",
      skin: "#C99A7A",
      hair: "#3B2F2C",
      clothes: "#2F5D62",
      long: false,
    }),
  ),
  image(
    "med_sampleMei",
    "Mei Chen",
    portrait({
      background: "#DCE6E4",
      skin: "#E6C2A2",
      hair: "#1F2A30",
      clothes: "#C9724F",
      long: true,
    }),
  ),
  image(
    "med_sampleDan",
    "Dan Okafor",
    portrait({
      background: "#F3E3CF",
      skin: "#8D5B45",
      hair: "#2B211E",
      clothes: "#5E8C8F",
      long: false,
    }),
  ),
  image(
    "med_sampleAsha",
    "Asha Patel",
    portrait({
      background: "#EAE3D6",
      skin: "#B97D5C",
      hair: "#33241F",
      clothes: "#8FA58A",
      long: true,
    }),
  ),
  image(
    "med_samplePriya",
    "Priya Shah",
    portrait({
      background: "#E0EAE6",
      skin: "#C68C68",
      hair: "#2A1F1C",
      clothes: "#E0B25E",
      long: true,
    }),
  ),
  image("med_sampleHarbour", "Two sailing boats on the harbour at sunset", harbour),
  image("med_sampleMap", "A map of North Quay, with the boatshed marked", map),
  image("med_sampleHarbourTrust", "Westbay Harbour Trust", harbourTrust),
  image("med_sampleRowingClub", "Westbay Rowing Club", rowingClub),
  image("med_sampleBoatyard", "North Quay Boatyard", boatyard),
  image("med_sampleArtsCouncil", "County Arts Council", artsCouncil),
]);
