import { block, buttons, doc, image, item, link, list, menu } from "./build.ts";
import type { Scene } from "./index.ts";

const person = (name: string, role: string, photo: string) =>
  item("team-member", { name, role, image: image(photo) });

/** A charity's home page, warm and direct, after the likes of charity: water. */
export const nonprofit: Scene = {
  name: "nonprofit",
  siteName: "Wellspring",
  menus: {
    main: menu("Our work", "Where we work", "Stories", "About"),
    footer: menu("Financials", "Contact", "Privacy"),
  },
  header: block("header", "standard", "default", {
    cta: link("Donate"),
    position: "overlay",
  }),
  sections: [
    block("hero", "cover", "inverse", {
      heading: "771 million people live without clean water.",
      headingRest: "We're changing that, one village at a time.",
      body: doc("Every pound you give funds wells, filters and the people who keep them running."),
      actions: buttons("Give monthly", "See our work"),
      points: [],
      image: image("med_photoc", "Children at a water point"),
      align: "start",
      height: "tall",
    }),
    block("stats", "split", "default", {
      kicker: "Since 2008",
      heading: "Your money goes further than you'd think.",
      intro: "Private donors pay our running costs, so every public pound goes to water projects.",
      stats: list("stat", [
        { value: "17M", label: "people with clean water", detail: "across 29 countries" },
        { value: "100%", label: "of public donations fund projects" },
        { value: "91k", label: "water projects funded" },
      ]),
      align: "start",
    }),
    block("steps", "row", "muted", {
      heading: "How your gift becomes water",
      steps: list("step", [
        { title: "You give", text: "Once or every month, in any amount.", icon: "heart" },
        {
          title: "Partners build",
          text: "Local teams drill wells and fit filters.",
          icon: "hammer",
        },
        {
          title: "We prove it",
          text: "Every project shows up on a map with photos and GPS.",
          icon: "map-pin",
        },
      ]),
      actions: [],
      align: "center",
    }),
    block("split", "bleed", "default", {
      kicker: "Stories",
      heading: "Helen used to walk four hours for water.",
      body: doc(
        "Now the well is a minute from her door. She spends the mornings on her shop, and her daughters are back in school.",
      ),
      points: [],
      actions: buttons("Read Helen's story"),
      image: image("med_talld", "Helen at her shop"),
      mediaSide: "end",
    }),
    block("quote", "panel", "brand", {
      quote: "When the water came, the whole village changed. Girls stayed in school.",
      name: "Grace Atim",
      role: "Water committee chair, Kitgum",
      image: image("med_facee"),
      mediaSide: "start",
    }),
    block(
      "team-grid",
      "grid",
      "default",
      {
        heading: "Our partners on the ground",
        actions: [],
        columns: "4",
        align: "start",
      },
      {
        people: [
          person("Amara Diallo", "Programme lead, Mali", "med_facea"),
          person("Joseph Mensah", "Engineer, Ghana", "med_faceb"),
          person("Ruth Wanjiru", "Hygiene trainer, Kenya", "med_facec"),
          person("Samuel Tesfaye", "Field officer, Ethiopia", "med_faced"),
        ],
      },
    ),
    block("call-to-action", "image", "inverse", {
      heading: "Join The Spring.",
      headingRest: "Monthly givers bring water to a new community every week.",
      actions: buttons("Give monthly"),
      image: image("med_photoe", "A woman drinking from a tap"),
    }),
  ],
  footer: block("footer", "centered", "default", {
    note: "Wellspring is a registered charity in England and Wales (1123456).",
    social: list("social", [
      { icon: "instagram", link: "https://instagram.com" },
      { icon: "youtube", link: "https://youtube.com" },
    ]),
    legal: "© 2027 Wellspring",
  }),
};
