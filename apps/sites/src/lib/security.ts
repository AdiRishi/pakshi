/*
 * What every response from a site tells the browser about where its content
 * may come from. Astro sends each page's content security policy, from the
 * directives in astro.config.ts and the hashes of what the page inlines;
 * this module names the theme's inline stylesheet, and sets the policy and
 * headers of the responses that don't come from a page.
 */

const base64 = (bytes: ArrayBuffer) => btoa(String.fromCodePoint(...new Uint8Array(bytes)));

/** The hash a content security policy names an inline stylesheet by. */
export const styleHash = async (css: string) =>
  `sha256-${base64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(css)))}` as const;

/** The policy for a small page written without Astro, whose only inline content is its stylesheet. */
export const plainPagePolicy = async (css: string) =>
  `default-src 'none'; style-src '${await styleHash(css)}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;

/**
 * A response with the headers every site response carries. A page brings
 * its own policy; anything else, such as a sitemap or an image, may load
 * nothing and can't be framed.
 */
export const secured = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!headers.get("content-type")?.startsWith("text/html"))
    headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
