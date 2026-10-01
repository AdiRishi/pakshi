import type { APIRoute } from "astro";

import { robots } from "../lib/seo.ts";

export const GET: APIRoute = ({ url }) =>
  new Response(robots(url.origin), { headers: { "content-type": "text/plain; charset=utf-8" } });
