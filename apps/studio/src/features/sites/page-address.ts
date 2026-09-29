/** An address made from a title: lowercase words joined by hyphens, under `prefix`. */
export const addressFor = (prefix: "/" | "/blog/", title: string) =>
  `${prefix}${title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
