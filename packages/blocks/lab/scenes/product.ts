import { block, buttons, doc, image, item, link, list, menu } from "./build.ts";
import type { Scene } from "./index.ts";

const tile = (props: Parameters<typeof item>[1]) => item("bento-tile", props);

const quote = (text: string, name: string, role: string, avatar: string) =>
  item("testimonial", { quote: text, name, role, avatar: image(avatar) });

const plan = (props: Parameters<typeof item>[1], features: ReadonlyArray<string>) =>
  item("pricing-plan", {
    ...props,
    features: list(
      "feature",
      features.map((feature) => ({ feature })),
    ),
  });

/** A software company's home page, dark and dense, after the likes of Linear and Vercel. */
export const product: Scene = {
  name: "product",
  siteName: "Relay",
  menus: {
    main: menu("Product", "Customers", "Changelog", "Pricing", "Docs"),
    footer: menu("Privacy", "Terms", "Status", "Security"),
  },
  header: block("header", "floating", "default", {
    cta: link("Start building"),
    secondary: link("Log in"),
    position: "sticky",
  }),
  sections: [
    block("hero", "stacked", "default", {
      badge: "Relay 3.0 is out: agents that triage for you",
      badgeLink: "https://example.org",
      heading: "Issue tracking you'll enjoy using.",
      headingRest: "Plan, build and ship with the speed your team already has.",
      body: doc(
        "Relay keeps every issue, cycle and roadmap in one fast tool, with keyboard shortcuts for everything and sync measured in milliseconds.",
      ),
      actions: buttons("Start building", "Watch the tour"),
      points: [],
      image: image("med_screen", "The Relay inbox with a list of issues"),
      align: "center",
      frame: "browser",
      backdrop: "arc",
    }),
    block("logo-strip", "marquee", "default", {
      heading: "Powering the teams behind the tools you use",
      logos: list(
        "logo",
        ["Circle", "Square", "Triangle", "Wave", "Circle", "Square"].map((name) => ({
          logo: image(`med_pakshiLogo${name}`, name),
        })),
      ),
      color: "mono",
    }),
    block(
      "bento",
      "grid",
      "default",
      {
        kicker: "Built for speed",
        heading: "A tool that keeps up.",
        headingRest: "Every view loads before you finish the shortcut.",
        actions: [],
        align: "start",
      },
      {
        tiles: [
          tile({
            title: "Cycles that run themselves",
            body: "Unfinished work rolls over, and the next cycle starts on time.",
            image: image("med_photoa"),
            size: "large",
            media: "bottom",
            tone: "muted",
          }),
          tile({
            title: "Command menu",
            body: "Do anything from the keyboard.",
            icon: "terminal",
            size: "small",
            tone: "default",
          }),
          tile({
            title: "Realtime sync",
            body: "Changes land on every screen in under 50ms.",
            icon: "zap",
            size: "small",
            tone: "brand",
          }),
          tile({
            kicker: "Roadmaps",
            title: "See the quarter at a glance",
            body: "Projects line up by team, with progress you don't have to ask for.",
            image: image("med_photob"),
            size: "wide",
            media: "cover",
            tone: "inverse",
          }),
          tile({
            title: "Works with your stack",
            body: "GitHub, Slack, Figma and Sentry, set up in a click.",
            icon: "puzzle",
            size: "small",
            tone: "default",
          }),
        ],
      },
    ),
    block("split", "standard", "default", {
      kicker: "Triage",
      heading: "An inbox that sorts itself.",
      body: doc(
        "Relay reads incoming bugs and requests, finds duplicates, and routes each one to the team that owns it.",
      ),
      points: list("point", [
        {
          icon: "inbox",
          title: "One inbox",
          body: "Support, Slack and GitHub feed into a single queue.",
        },
        { icon: "link", title: "Auto-linking", body: "Pull requests close the issues they fix." },
      ]),
      actions: buttons("Read about triage"),
      image: image("med_screen", "A triage queue"),
      mediaSide: "alternate",
      frame: "framed",
    }),
    block("split", "standard", "default", {
      kicker: "Insights",
      heading: "Know what's slipping before it slips.",
      body: doc(
        "Cycle time, scope creep and blocked work, charted from the issues you already track.",
      ),
      points: [],
      actions: buttons("Explore insights"),
      image: image("med_photoc", "Charts of cycle time"),
      mediaSide: "alternate",
      frame: "framed",
    }),
    block("stats", "row", "default", {
      stats: list("stat", [
        { value: "50ms", label: "Median sync time" },
        { value: "10k+", label: "Teams on Relay" },
        { value: "99.99%", label: "Uptime last year" },
        { value: "4.9", label: "Average review score" },
      ]),
      align: "center",
    }),
    block(
      "testimonials",
      "marquee",
      "default",
      {
        heading: "Teams switch, and stay.",
        actions: [],
        align: "center",
        style: "cards",
      },
      {
        items: [
          quote(
            "We moved 40 engineers over in a weekend. Nobody has asked to go back.",
            "Maya Chen",
            "VP Engineering, Lumen",
            "med_facea",
          ),
          quote(
            "The first tracker our designers open without being asked.",
            "Tom Okafor",
            "Head of Design, Arc",
            "med_faceb",
          ),
          quote(
            "Triage used to take my Monday morning. Now it takes a coffee.",
            "Sara Lind",
            "Support Lead, Fjord",
            "med_facec",
          ),
          quote(
            "It's fast in a way that changes how you work.",
            "Dev Patel",
            "CTO, Northbeam",
            "med_faced",
          ),
        ],
      },
    ),
    block(
      "pricing",
      "cards",
      "default",
      {
        heading: "Simple pricing.",
        headingRest: "Free until your team outgrows it.",
        note: "Prices in US dollars, billed yearly. Startups get a year of Business free.",
        align: "center",
      },
      {
        plans: [
          plan(
            {
              name: "Free",
              price: "$0",
              description: "For small teams trying Relay.",
              button: link("Start free"),
              featured: "no",
            },
            ["Up to 10 people", "Unlimited issues", "Slack and GitHub"],
          ),
          plan(
            {
              name: "Business",
              badge: "Popular",
              price: "$12",
              period: "per person a month",
              description: "For teams that ship every week.",
              button: link("Start a trial"),
              featured: "brand",
            },
            ["Unlimited people", "Insights and roadmaps", "Triage agents", "Priority support"],
          ),
          plan(
            {
              name: "Enterprise",
              price: "Custom",
              description: "For companies with many teams.",
              button: link("Talk to sales"),
              featured: "no",
            },
            ["SAML and SCIM", "Audit log", "Data residency"],
          ),
        ],
      },
    ),
    block("faq", "split", "default", {
      heading: "Questions",
      questions: list("question", [
        {
          question: "Can we import from Jira?",
          answer: doc(
            "Yes. The importer brings issues, comments and history across in a few minutes.",
          ),
        },
        {
          question: "Is there an API?",
          answer: doc("A GraphQL API and webhooks for everything you can do in the app."),
        },
        {
          question: "Where is our data stored?",
          answer: doc("In the US by default, or the EU on Enterprise."),
        },
      ]),
      actions: [],
      align: "start",
    }),
    block("call-to-action", "centered", "default", {
      heading: "Built for the way you work.",
      headingRest: "Try it with your team today.",
      actions: buttons("Start building", "Talk to sales"),
      backdrop: "grid",
    }),
  ],
  footer: block("footer", "columns", "default", {
    note: "Relay is issue tracking for teams that ship.",
    social: list("social", [
      { icon: "x", link: "https://x.com" },
      { icon: "github", link: "https://github.com" },
    ]),
    legal: "© 2027 Relay Software Inc.",
  }),
};
