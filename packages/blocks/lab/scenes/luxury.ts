import { block, buttons, doc, image, item, link, list, menu } from "./build.ts";
import type { Scene } from "./index.ts";

const product = (title: string, text: string, photo: string) =>
  item("card", { image: image(photo), kicker: "Skin", title, text, link: "https://example.org" });

/** A skincare brand's home page, quiet and photographic, after the likes of Aesop. */
export const luxury: Scene = {
  name: "luxury",
  siteName: "Ostra",
  menus: {
    main: menu("Skin", "Hair", "Body", "Home", "Stores"),
    footer: menu("Shipping", "Returns", "Careers", "Privacy"),
  },
  header: block("header", "centered-logo", "default", {
    cta: link("Find a store"),
    announcement: "Complimentary samples with every order",
    position: "overlay",
    bar: "inverse",
  }),
  sections: [
    block("hero", "cover", "default", {
      heading: "Formulations for the skin you live in.",
      body: doc("Plant-based care made in small batches since 1994."),
      actions: buttons("Discover skin care"),
      points: [],
      image: image("med_photod", "Amber glass bottles on a stone ledge"),
      align: "start",
      height: "screen",
    }),
    block("statement", "center", "default", {
      heading: "We make products for skin, hair and body,",
      headingRest:
        "using plant-based and lab-made ingredients of the highest quality, chosen for what they do.",
      link: link("Our approach"),
      size: "large",
    }),
    block(
      "cards",
      "grid",
      "default",
      {
        heading: "New to the range",
        actions: buttons("All skin care"),
        columns: "3",
        crop: "portrait",
      },
      {
        cards: [
          product("Parsley Seed Serum", "An antioxidant serum for most skin types.", "med_talla"),
          product("Camellia Nut Cream", "A rich cream for dry skin in cold months.", "med_tallb"),
          product("Fabulous Face Oil", "A balancing oil for combination skin.", "med_tallc"),
        ],
      },
    ),
    block("split", "bleed", "muted", {
      kicker: "Stores",
      heading: "Every store is made for its street.",
      body: doc(
        "Our architects work with local makers and materials, so the shop in Kyoto shares little with the one in Copenhagen, apart from the sinks.",
      ),
      points: [],
      actions: buttons("Visit a store"),
      image: image("med_photoe", "A store interior of oak and plaster"),
      mediaSide: "start",
    }),
    block("quote", "centered", "default", {
      quote: "The sink is where the store begins. We wanted people to touch everything.",
      name: "Hanne Kjær",
      role: "Architect, Copenhagen store",
    }),
    block("gallery", "scroller", "default", {
      heading: "The Ostra Journal",
      images: list("image", [
        { image: image("med_tallc"), caption: "Notes on winter skin" },
        { image: image("med_talld"), caption: "A visit to the lavender fields" },
        { image: image("med_talle"), caption: "In the lab with our chemists" },
        { image: image("med_tallf"), caption: "Five rituals for slow mornings" },
        { image: image("med_tallg"), caption: "The making of Hwyl" },
      ]),
      columns: "3",
      crop: "portrait",
    }),
    block("form-section", "inline", "muted", {
      heading: "Letters from Ostra",
      intro: "News of new formulations and store openings, a few times a year.",
      points: [],
      form: { $ref: "form", id: "frm_newsletter" },
    }),
  ],
  footer: block("footer", "wordmark", "inverse", {
    social: list("social", [
      { icon: "instagram", link: "https://instagram.com" },
      { icon: "pinterest", link: "https://pinterest.com" },
    ]),
    legal: "© 2027 Ostra Skin Care Pty Ltd",
  }),
};
