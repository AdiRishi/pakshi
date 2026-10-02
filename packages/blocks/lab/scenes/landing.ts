import type { Scene } from "./index.ts";

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const button = (id: string, label: string) => ({
  id,
  button: { label, link: "https://example.org" },
});

const feature = (title: string, body: string, icon: string) => ({
  type: "feature-item",
  variant: "default",
  props: { title, body, icon },
});

/** A product's home page, made from the blocks and nothing else. */
export const landing: Scene = {
  name: "landing",
  siteName: "Northwind",
  menus: {
    main: [
      { id: "mi_product", label: "Product", target: "https://example.org", children: [] },
      { id: "mi_customers", label: "Customers", target: "https://example.org" },
      { id: "mi_pricing", label: "Pricing", target: "https://example.org" },
      { id: "mi_journal", label: "Journal", target: "https://example.org" },
    ],
    footer: [
      { id: "mi_privacy", label: "Privacy", target: "https://example.org" },
      { id: "mi_terms", label: "Terms", target: "https://example.org" },
    ],
  },
  header: {
    type: "header",
    variant: "standard",
    surface: "default",
    props: {
      cta: { label: "Start free", link: "https://example.org" },
      secondary: { label: "Sign in", link: "https://example.org" },
      position: "sticky",
    },
  },
  sections: [
    {
      type: "hero",
      variant: "stacked",
      surface: "default",
      props: {
        badge: "New: shared timelines",
        badgeLink: "https://example.org",
        heading: "Plan the work.",
        headingRest: "Then ship it, together.",
        body: doc(
          "Northwind keeps projects, people and deadlines in one calm place, so the team spends its days making things.",
        ),
        actions: [button("it_a", "Start free"), button("it_b", "Book a demo")],
        points: [],
        image: {
          $ref: "media",
          id: "med_screen",
          alt: "The Northwind app showing a project timeline",
        },
        align: "center",
        frame: "framed",
        backdrop: "glow",
      },
    },
    {
      type: "feature-grid",
      variant: "grid",
      surface: "default",
      props: {
        kicker: "Why teams switch",
        heading: "Built for the way work moves.",
        headingRest: "Fast to start, hard to outgrow.",
        actions: [],
        columns: "3",
        style: "lines",
      },
      slots: {
        items: [
          feature(
            "Timelines",
            "See every project's next milestone at a glance, across teams.",
            "calendar-days",
          ),
          feature(
            "Focus mode",
            "Hide everything but today's work when you need to get it done.",
            "target",
          ),
          feature(
            "Shared docs",
            "Specs and notes live beside the work they describe.",
            "file-text",
          ),
          feature("Automations", "Move work forward when tests pass or reviews land.", "zap"),
          feature("Insights", "Spot slipping projects before they slip.", "chart-line"),
          feature(
            "Secure by default",
            "SSO, audit logs and data residency on every plan.",
            "shield-check",
          ),
        ],
      },
    },
    {
      type: "hero",
      variant: "split",
      surface: "muted",
      props: {
        kicker: "For leads",
        heading: "Know where everything stands",
        body: doc(
          "Weekly updates write themselves from the work your team already does. No status meetings, no chasing.",
        ),
        actions: [button("it_c", "See how it works")],
        points: [
          { id: "it_p1", point: "Updates every Friday" },
          { id: "it_p2", point: "Shared with one link" },
        ],
        image: { $ref: "media", id: "med_office", alt: "A team around a table" },
        align: "start",
        mediaSide: "start",
      },
    },
    {
      type: "feature-grid",
      variant: "split",
      surface: "default",
      props: {
        heading: "Everything in one place",
        intro: "Bring your tools along. Northwind connects to the ones you already use.",
        actions: [button("it_d", "All integrations")],
        style: "cards",
      },
      slots: {
        items: [
          feature("Calendar", "Deadlines show up where your day already is.", "calendar"),
          feature("Chat", "Updates reach the channel that cares.", "message-circle"),
          feature("Code", "Pull requests move issues along.", "code"),
          feature("Email", "Forward an email, get a task.", "mail"),
        ],
      },
    },
    {
      type: "hero",
      variant: "stacked",
      surface: "brand",
      props: {
        heading: "Start your first project today",
        body: doc("Free for teams of up to ten. No card needed."),
        actions: [button("it_e", "Start free"), button("it_f", "Talk to sales")],
        points: [],
        align: "center",
      },
    },
  ],
  footer: {
    type: "footer",
    variant: "columns",
    surface: "default",
    props: {
      note: "Northwind helps teams plan and ship their work.",
      social: [
        { id: "it_x", icon: "x", link: "https://x.com" },
        { id: "it_gh", icon: "github", link: "https://github.com" },
        { id: "it_li", icon: "linkedin", link: "https://linkedin.com" },
      ],
      legal: "© 2027 Northwind Ltd.",
    },
  },
};
