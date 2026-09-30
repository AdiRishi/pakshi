import type { Fetched } from "@repo/agent";
import { routingKeys } from "@repo/contracts/snapshot";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";

import { toMarkdown } from "./markdown.ts";

/** The most a web page may be, in bytes. */
const maxBytes = 2_000_000;
/** How long a web page has to answer, in milliseconds. */
const timeout = 10_000;
/** Redirects followed within one host. */
const maxRedirects = 3;

const refused = (reason: string): Fetched => ({ ok: false, reason });

/** A response's body, or null once it passes the size limit. */
const bodyWithin = async (response: Response) => {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.byteLength;
  }
  return body;
};

/**
 * Reads a web page the person linked to, as Markdown: a GET within the size
 * and time limits, following redirects only within the same host, and never
 * to Studio or a site Pakshi serves.
 */
export const readWebPage =
  (env: StudioApiEnv, studioHost: string) =>
  async (url: URL): Promise<Fetched> => {
    if (url.protocol !== "https:" && url.protocol !== "http:")
      return refused("Only http and https addresses can be read.");
    const host = url.hostname.toLowerCase();
    if (host === studioHost || (await env.ROUTING.get(routingKeys.host(host))) !== null)
      return refused("That's one of Pakshi's own addresses, which the agent doesn't read.");
    let current = url;
    for (let redirect = 0; redirect <= maxRedirects; redirect++) {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { accept: "text/html, text/plain, text/markdown" },
        signal: AbortSignal.timeout(timeout),
      }).catch(() => null);
      if (response === null) return refused("The page didn't answer in time.");
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location !== null) {
        const next = new URL(location, current);
        if (next.hostname.toLowerCase() !== host)
          return refused(
            "The page sends visitors to another site, which the agent doesn't follow.",
          );
        current = next;
        continue;
      }
      if (!response.ok) return refused(`The page answered ${response.status}.`);
      const type = response.headers.get("content-type") ?? "";
      const html = type.includes("text/html");
      if (!html && !type.includes("text/plain") && !type.includes("text/markdown"))
        return refused("The address isn't a web page the agent can read.");
      const body = await bodyWithin(response);
      if (body === null) return refused("The page is too large to read.");
      if (!html) return { ok: true, markdown: new TextDecoder().decode(body) };
      const converted = await toMarkdown(env, {
        name: "page.html",
        blob: new Blob([body], { type: "text/html" }),
      });
      return converted.ok ? converted : refused("The page couldn't be read.");
    }
    return refused("The page redirects too many times.");
  };
