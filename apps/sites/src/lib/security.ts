/*
 * What every response from a site tells the browser about where its content
 * may come from. A page may run its own scripts and the inline scripts it was
 * rendered with, named by their hashes, so a cached copy keeps a policy that
 * matches it; anything else loads nothing.
 */

const base64 = (bytes: ArrayBuffer) => btoa(String.fromCodePoint(...new Uint8Array(bytes)));

/** The hash a content security policy names an inline script or stylesheet by. */
export const inlineHash = async (text: string) =>
  `sha256-${base64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))}` as const;

/** The policy for a small page with no scripts, whose only inline content is its stylesheet. */
export const plainPagePolicy = async (css: string) =>
  `default-src 'none'; style-src '${await inlineHash(css)}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;

const inlineScript = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

/**
 * The policy for a rendered page: its own scripts, styles, fonts and images,
 * and each inline script it holds. Styles may be inline, since components
 * that animate render their first frame as style attributes.
 */
export const pagePolicy = async (html: string) => {
  const scripts = await Promise.all(
    Array.from(html.matchAll(inlineScript), ([, text]) => inlineHash(text ?? "")),
  );
  return [
    "default-src 'none'",
    ["script-src 'self'", ...new Set(scripts).values().map((hash) => `'${hash}'`)].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
};

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
