import { entryLimit, type Intake, intakePath } from "@repo/contracts/entries";
import { FormFieldId, FormId, SiteId } from "@repo/contracts/ids";
import { PagePath } from "@repo/contracts/page";
import { LiveRelease, routingKeys, snapshotReader } from "@repo/contracts/snapshot";
import { readEntry } from "@repo/domain/forms";
import type { SitesApiEnv } from "@repo/infra/worker-bindings";
import { Option, Schema } from "effect";

const decodeLive = Schema.decodeUnknownOption(Schema.fromJsonString(LiveRelease));

const answer = (intake: Intake, status: number) => Response.json(intake, { status });

/** The body's text, or null once it passes the limit, read no further than that. */
const readCapped = async (request: Request) => {
  if (Number(request.headers.get("content-length") ?? "0") > entryLimit) return null;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.byteLength;
    if (size > entryLimit) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(read.value, { stream: true });
  }
  return text + decoder.decode();
};

/**
 * A form post that `sites` forwards, at `${intakePath}/{site}/{form}?page=`:
 * checked against the form in the site's live release, then stored in the
 * site's own SiteSubmissions.
 */
export const takeEntry = async (request: Request, env: SitesApiEnv) => {
  const url = new URL(request.url);
  const [siteId = "", formId = "", ...rest] = url.pathname.slice(intakePath.length + 1).split("/");
  const ids = Option.all({
    site: Schema.decodeOption(SiteId)(siteId),
    form: Schema.decodeOption(FormId)(formId),
    page: Schema.decodeUnknownOption(PagePath)(url.searchParams.get("page")),
  });
  if (request.method !== "POST" || Option.isNone(ids) || rest.length > 0)
    return answer({ _tag: "NoForm" }, 404);
  const { site, form, page } = ids.value;
  const body = await readCapped(request);
  if (body === null) return answer({ _tag: "TooLarge" }, 413);
  const live = decodeLive(await env.ROUTING.get(routingKeys.site(site)));
  if (Option.isNone(live)) return answer({ _tag: "NoForm" }, 404);
  const manifest = await snapshotReader(
    async (key) => (await env.CONTENT.get(key))?.text() ?? null,
  ).manifest(site, live.value.snapshot);
  const definition = manifest.forms[form];
  if (definition === undefined) return answer({ _tag: "NoForm" }, 404);
  const posted = new URLSearchParams(body);
  const read = readEntry(definition, (field: FormFieldId) => posted.get(field));
  if (!read.ok) return answer({ _tag: "Invalid", issues: read.issues }, 422);
  await env.SITE_SUBMISSIONS.getByName(site).receive(
    { id: site, name: manifest.settings.name },
    { form, formName: definition.name, page, email: read.email, fields: read.fields },
  );
  return answer({ _tag: "Received" }, 200);
};
