import { defineConfig } from "blume";

import { name } from "./package.json";

export default defineConfig({
  title: name
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" "),
  description: "Vision, product spec, technical design, and build plan for Pakshi.",
  // The logo already carries the wordmark, so the header shows no title beside it.
  logo: {
    image: {
      light: "/logo.svg",
      dark: "/logo-inverse.svg",
      alt: "Pakshi",
    },
    text: "",
  },
  theme: {
    accent: { light: "#0f766e", dark: "#2dd4bf" },
    mode: "system",
  },
  deployment: {
    site: "https://adirishi.github.io",
    base: "/pakshi",
  },
});
