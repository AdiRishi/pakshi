import { block, buttons, doc, image, item, link, list, menu } from "./build.ts";
import type { Scene } from "./index.ts";

const speaker = (name: string, role: string, photo: string) =>
  item("team-member", { name, role, image: image(photo) });

const plan = (props: Parameters<typeof item>[1], features: ReadonlyArray<string>) =>
  item("pricing-plan", {
    ...props,
    features: list(
      "feature",
      features.map((feature) => ({ feature })),
    ),
  });

/** A conference's home page, loud and scheduled, after the likes of Config and Web Summit. */
export const conference: Scene = {
  name: "conference",
  siteName: "Signal 27",
  menus: {
    main: menu("Speakers", "Schedule", "Venue", "Tickets"),
    footer: menu("Code of conduct", "Sponsors", "Contact"),
  },
  header: block("header", "standard", "default", {
    cta: link("Get tickets"),
    announcement: "Early bird ends 30 April",
    position: "sticky",
    bar: "accent",
  }),
  sections: [
    block("hero", "split", "default", {
      kicker: "Lisbon · 12 to 14 June",
      heading: "Three days on the future of design tools.",
      body: doc("Talks, workshops and long dinners with 2,000 people who make things on screens."),
      actions: buttons("Get tickets", "See the schedule"),
      points: [],
      proof: "1,400 tickets already sold",
      proofImages: list(
        "photo",
        ["med_facea", "med_faceb", "med_facec", "med_faced"].map((id) => ({ photo: image(id) })),
      ),
      image: image("med_tallh", "A crowd at a conference talk"),
      mediaSide: "end",
      backdrop: "dots",
    }),
    block("logo-strip", "row", "default", {
      heading: "Supported by",
      logos: list(
        "logo",
        ["Circle", "Square", "Triangle", "Wave"].map((name) => ({
          logo: image(`med_pakshiLogo${name}`, name),
        })),
      ),
      color: "mono",
    }),
    block(
      "team-grid",
      "overlay",
      "inverse",
      {
        kicker: "Speakers",
        heading: "Forty speakers who build the tools you use.",
        actions: buttons("All speakers"),
        columns: "4",
        align: "start",
      },
      {
        people: [
          speaker("Ines Moreau", "Design lead, Canvas", "med_facee"),
          speaker("Kenji Sato", "Founder, Fold", "med_facef"),
          speaker("Lena Ortiz", "Type designer", "med_faceg"),
          speaker("Marcus Webb", "Head of Product, Grid", "med_faceh"),
        ],
      },
    ),
    block("timeline", "agenda", "default", {
      heading: "Day one",
      intro: "Doors open at 8:30. Coffee is on us.",
      actions: buttons("Full schedule"),
      entries: list("entry", [
        {
          when: "09:30",
          title: "Opening keynote: tools that think with you",
          who: "Ines Moreau",
          place: "Main stage",
        },
        { when: "11:00", title: "Variable fonts in the wild", who: "Lena Ortiz", place: "Stage 2" },
        { when: "13:00", title: "Lunch by the river", place: "Terrace" },
        {
          when: "14:30",
          title: "Workshop: prototyping with real data",
          who: "Kenji Sato",
          place: "Studio A",
        },
        {
          when: "17:00",
          title: "Panel: who owns the design system?",
          who: "Four guests",
          place: "Main stage",
        },
      ]),
    }),
    block("gallery", "masonry", "muted", {
      heading: "Last year in Lisbon",
      images: list(
        "image",
        ["med_photoa", "med_tallb", "med_photoc", "med_talld", "med_photoe", "med_tallf"].map(
          (id) => ({ image: image(id) }),
        ),
      ),
      columns: "3",
      crop: "landscape",
    }),
    block(
      "pricing",
      "cards",
      "default",
      {
        heading: "Tickets",
        note: "Prices include VAT. Group discounts for five or more.",
        align: "center",
      },
      {
        plans: [
          plan(
            {
              name: "Online",
              price: "€99",
              description: "Every talk, streamed live.",
              button: link("Buy online pass"),
              featured: "no",
            },
            ["Live stream", "Recordings for a year"],
          ),
          plan(
            {
              name: "Conference",
              badge: "Early bird",
              price: "€590",
              description: "Three days in Lisbon.",
              button: link("Buy ticket"),
              featured: "inverse",
            },
            ["All talks", "Lunch every day", "Opening party"],
          ),
          plan(
            {
              name: "Conference + workshops",
              price: "€890",
              description: "For the full week.",
              button: link("Buy ticket"),
              featured: "no",
            },
            ["Everything in Conference", "Two workshops", "Speaker dinner"],
          ),
        ],
      },
    ),
    block("location", "split", "default", {
      heading: "At the river's edge",
      address: "LX Factory\nRua Rodrigues de Faria 103\n1300-501 Lisboa",
      hours: list("hours", [
        { days: "12 and 13 June", times: "08:30 to 19:00" },
        { days: "14 June", times: "09:00 to 16:00" },
      ]),
      directions: "Tram 15 from the centre stops at the gate.",
      map: image("med_photog", "The venue from the river"),
      actions: buttons("Hotels nearby"),
      mediaSide: "end",
    }),
    block("faq", "accordion", "default", {
      heading: "Good to know",
      questions: list("question", [
        {
          question: "Can I get a refund?",
          answer: doc("Tickets can be transferred to someone else until the day before."),
        },
        {
          question: "Is there a code of conduct?",
          answer: doc("Yes, and we enforce it. Read it before you come."),
        },
        {
          question: "Are talks recorded?",
          answer: doc("Every main-stage talk goes online within a week."),
        },
      ]),
      actions: [],
      align: "center",
    }),
    block("call-to-action", "panel", "brand", {
      heading: "See you in Lisbon.",
      intro: "Early bird tickets save €200 until 30 April.",
      actions: buttons("Get tickets"),
      image: image("med_photoh"),
      mediaSide: "end",
      backdrop: "none",
    }),
  ],
  footer: block("footer", "simple", "default", {
    social: list("social", [
      { icon: "x", link: "https://x.com" },
      { icon: "youtube", link: "https://youtube.com" },
    ]),
    legal: "© 2027 Signal Conferences Lda",
  }),
};
