import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

/*
 * Sign-in and making accounts run in studio-api, behind form posts Studio
 * answers itself. Each form posts to its own page, whose handler calls
 * studio-api as the browser would, then redirects with whatever cookies
 * studio-api set, so the forms work before Studio's JavaScript loads.
 */

/** A posted form's fields, or none when the form isn't the one expected. */
export const readForm = async <S extends Schema.Top & { readonly DecodingServices: never }>(
  request: Request,
  schema: S,
): Promise<Option.Option<S["Type"]>> => {
  const form = await request.formData().then(Option.some, () => Option.none<FormData>());
  return Option.flatMap(form, (fields) => Schema.decodeOption(schema)(Object.fromEntries(fields)));
};

/**
 * Posts JSON to a studio-api path for the browser request being answered,
 * with its cookies and Studio's origin, which Better Auth and the accounts
 * endpoints check.
 */
export const postToStudioApi = (request: Request, path: string, body: Schema.JsonObject) => {
  const origin = new URL(request.url).origin;
  const headers = new Headers({ "content-type": "application/json", origin });
  const cookie = request.headers.get("cookie");
  if (cookie !== null) headers.set("cookie", cookie);
  return env.STUDIO_API.fetch(
    new Request(`${origin}${path}`, { method: "POST", headers, body: JSON.stringify(body) }),
  );
};

/** Sends the browser on, carrying the cookies a studio-api response set. */
export const redirectTo = (request: Request, location: string, from?: Response) => {
  const headers = new Headers({ location: new URL(location, request.url).href });
  for (const cookie of from?.headers.getSetCookie() ?? []) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
};
