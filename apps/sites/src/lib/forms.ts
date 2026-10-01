import { Intake, intakePath } from "@repo/contracts/entries";
import { FormId } from "@repo/contracts/ids";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

import { plainPagePolicy } from "./security.ts";
import type { LiveSite } from "./snapshot.ts";

const decodeIntake = Schema.decodeUnknownSync(Intake);

const refusalCss =
  "main{max-width:36rem;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif}";

/** A small page about a form post that didn't go through, in the site's own words. */
const refusal = async (status: number, title: string, message: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${refusalCss}</style></head><body><main><h1>${title}</h1>${message}</main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": await plainPagePolicy(refusalCss),
      },
    },
  );

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * A visitor's form post, which sites-api checks against the live release and
 * stores. A sent form sends the visitor back to its page, which thanks them.
 */
export const takeFormPost = async (request: Request, site: LiveSite) => {
  const url = new URL(request.url);
  const form = Schema.decodeUnknownOption(FormId)(url.searchParams.get("form"));
  if (Option.isNone(form))
    return refusal(404, "This form isn't here", "<p>There's no form at this address.</p>");
  const forwarded = new Request(
    `https://sites-api.pakshi${intakePath}/${site.id}/${form.value}?page=${encodeURIComponent(url.pathname)}`,
    { method: "POST", headers: request.headers, body: request.body },
  );
  const response = await env.SITES_API.fetch(forwarded);
  const intake = decodeIntake(await response.json());
  switch (intake._tag) {
    case "Received":
      return Response.redirect(`${url.origin}${url.pathname}?sent=${form.value}`, 303);
    case "Invalid":
      return refusal(
        422,
        "Some answers need another look",
        `<ul>${intake.issues.map((issue) => `<li>${escape(issue.label)}: ${escape(issue.message)}</li>`).join("")}</ul><p>Go back to change them. Your answers are still there.</p>`,
      );
    case "TooLarge":
      return refusal(413, "That was too much to send", "<p>Go back and shorten your answers.</p>");
    case "NoForm":
      return refusal(
        404,
        "This form isn't here any more",
        "<p>The page changed since you opened it. Reload it to see what's there now.</p>",
      );
  }
};
