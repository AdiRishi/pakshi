import { block, buttons, doc, image, item, link, list, menu } from "./build.ts";
import type { Scene } from "./index.ts";

const exhibition = (title: string, date: string, place: string, photo: string, body?: string) =>
  item("event-card", {
    date,
    place,
    title,
    ...(body !== undefined && { body }),
    image: image(photo),
    link: link("Book tickets"),
  });

const visit = (title: string, text: string, icon: string) =>
  item("card", { icon, title, text, link: "https://example.org" });

/** A gallery's home page, bold and typographic, after the likes of Tate and MoMA. */
export const museum: Scene = {
  name: "museum",
  siteName: "Kestrel Gallery",
  menus: {
    main: menu("Visit", "Exhibitions", "Collection", "Learn", "Membership"),
    footer: menu("Accessibility", "Press", "Jobs", "Privacy"),
  },
  header: block("header", "standard", "default", {
    cta: link("Book tickets"),
    secondary: link("Become a member"),
    announcement: "Open today 10:00 to 18:00. Free entry to the collection.",
    position: "sticky",
    bar: "inverse",
  }),
  sections: [
    block("hero", "editorial", "default", {
      kicker: "Until 14 February",
      heading: "Lee Krasner: Living Colour",
      body: doc(
        "The first major retrospective in Europe for over fifty years, with nearly a hundred works from every decade of her career.",
      ),
      actions: buttons("Book tickets", "About the exhibition"),
      points: [],
      image: image("med_photof", "A large abstract painting in a gallery"),
    }),
    block(
      "event-cards",
      "grid",
      "default",
      {
        heading: "Exhibitions",
        actions: buttons("Everything on"),
        columns: "3",
      },
      {
        events: [
          exhibition("Surrealism Beyond Borders", "Until 3 March", "Level 2", "med_photog"),
          exhibition("Yayoi Kusama: Infinity Rooms", "Booking until June", "Level 0", "med_photoh"),
          exhibition("Women in Revolt!", "From 8 November", "Level 4", "med_photoa"),
        ],
      },
    ),
    block("statement", "start", "brand", {
      kicker: "Membership",
      heading: "See every exhibition for free, as often as you like.",
      headingRest: "Members also get late views, a magazine and the members' room.",
      link: link("Join from £7 a month"),
      size: "large",
    }),
    block(
      "cards",
      "list",
      "default",
      {
        heading: "Plan your visit",
        actions: [],
        columns: "2",
        crop: "landscape",
        rows: "lines",
      },
      {
        cards: [
          visit(
            "Opening times",
            "Open every day from 10:00 to 18:00, and until 22:00 on Fridays.",
            "clock",
          ),
          visit(
            "Getting here",
            "Two minutes from the station, with step-free access from the river.",
            "map-pin",
          ),
          visit(
            "Eat and drink",
            "A café on the ground floor and a restaurant with a view.",
            "utensils",
          ),
          visit(
            "Accessibility",
            "Wheelchairs, large-print guides and quiet times every week.",
            "accessibility",
          ),
        ],
      },
    ),
    block("gallery", "mosaic", "inverse", {
      kicker: "The collection",
      heading: "Seventy thousand works, free to see.",
      images: list("image", [
        { image: image("med_photob"), caption: "Turbine Hall" },
        { image: image("med_square1"), caption: "Room 4: Abstraction" },
        { image: image("med_square2"), caption: "Room 7: Light" },
        { image: image("med_square3"), caption: "Sculpture terrace" },
        { image: image("med_square4"), caption: "Print room" },
      ]),
      columns: "4",
      crop: "landscape",
    }),
    block("call-to-action", "split", "default", {
      heading: "Free for under-18s, always.",
      intro: "Families can book a free activity bag at the desk.",
      actions: buttons("Family visits"),
      backdrop: "none",
    }),
  ],
  footer: block("footer", "columns", "inverse", {
    note: "Kestrel Gallery, Riverside, London SE1. Registered charity 1234567.",
    social: list("social", [
      { icon: "instagram", link: "https://instagram.com" },
      { icon: "youtube", link: "https://youtube.com" },
      { icon: "facebook", link: "https://facebook.com" },
    ]),
    newsletterHeading: "What's on, every month",
    newsletter: { $ref: "form", id: "frm_newsletter" },
    legal: "© Kestrel Gallery 2027",
  }),
};
