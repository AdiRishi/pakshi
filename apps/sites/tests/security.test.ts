import { describe, expect, test } from "vitest";

import { inlineHash, pagePolicy, plainPagePolicy, secured } from "../src/lib/security.ts";

describe("what a site's responses let the browser load", () => {
  test("an inline script or stylesheet is named by the SHA-256 of its text", async () => {
    // The SHA-256 of the empty string, as base64.
    expect(await inlineHash("")).toBe("sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });

  test("a page may run its own scripts and exactly the inline scripts it holds", async () => {
    const policy = await pagePolicy(
      '<head><script type="module" src="/assets/main.js"></script><script>self.$x=1</script></head><body><script class="$tsr">self.$x=1</script><script></script></body>',
    );
    const scripts = policy.split("; ").find((directive) => directive.startsWith("script-src"));
    expect(scripts).toBe(
      `script-src 'self' '${await inlineHash("self.$x=1")}' '${await inlineHash("")}'`,
    );
  });

  test("a small page with no scripts may apply only its own stylesheet", async () => {
    expect(await plainPagePolicy("")).toBe(
      "default-src 'none'; style-src 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
  });

  test("a page keeps its own policy, and anything that isn't a page loads nothing", () => {
    const page = secured(
      new Response("<p>Hello</p>", {
        headers: { "content-type": "text/html", "content-security-policy": "default-src 'self'" },
      }),
    );
    expect(page.headers.get("content-security-policy")).toBe("default-src 'self'");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    const redirect = secured(Response.redirect("https://www.example.org/", 301));
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("https://www.example.org/");
    expect(redirect.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });
});
