import { SqliteClient } from "@effect/sql-sqlite-do";
import type { NewEntry } from "@repo/contracts/entries";
import { intakePath } from "@repo/contracts/entries";
import type { EntryId, FormId, SiteId } from "@repo/contracts/ids";
import type { Timestamp } from "@repo/contracts/release";
import type { LiveSettings } from "@repo/contracts/settings";
import type { SitesApiEnv } from "@repo/infra/worker-bindings";
import { DurableObject } from "cloudflare:workers";
import { Effect, Layer, ManagedRuntime } from "effect";
import * as Migrator from "effect/sql/Migrator";

import { type EntriesBefore, migrations, SiteEntries, type StorageError } from "./entries.ts";
import { takeEntry } from "./intake.ts";

/**
 * One site's form entries: that site's own customer database, so a flood of
 * entries on one site's forms leaves every other site's alone. sites-api
 * stores what visitors send; studio-api reads and deletes entries for the
 * people who may.
 */
export class SiteSubmissions extends DurableObject<SitesApiEnv> {
  #runtime: ManagedRuntime.ManagedRuntime<SiteEntries, never> | undefined;

  #run<A>(use: (entries: SiteEntries["Service"]) => Effect.Effect<A, StorageError>) {
    this.#runtime ??= ManagedRuntime.make(
      SiteEntries.layer.pipe(
        Layer.provide(Layer.effectDiscard(Migrator.make({})({ loader: migrations }))),
        Layer.provideMerge(SqliteClient.layer({ storage: this.ctx.storage })),
        Layer.orDie,
      ),
    );
    return this.#runtime.runPromise(Effect.orDie(SiteEntries.use(use)));
  }

  /** Takes the site's settings that take effect at once, and the Studio address its emails link to. */
  configure(settings: LiveSettings, studio: string) {
    return this.#run((entries) => entries.configure(settings, studio));
  }

  /** Stores an entry, and emails the addresses its form's entries go to. */
  async receive(site: { readonly id: SiteId; readonly name: string }, entry: NewEntry) {
    const received = await this.#run((entries) => entries.receive(site, entry));
    if (received.notify) await this.ctx.storage.setAlarm(Date.now());
    return received.entry;
  }

  forms() {
    return this.#run((entries) => entries.forms);
  }

  entries(page: EntriesBefore) {
    return this.#run((entries) => entries.entries(page));
  }

  receivedSince(since: Timestamp) {
    return this.#run((entries) => entries.receivedSince(since));
  }

  everyEntry(form: FormId) {
    return this.#run((entries) => entries.everyEntry(form));
  }

  async entry(id: EntryId) {
    const found = await this.#run((entries) => entries.entry(id));
    return found._tag === "Some" ? found.value : null;
  }

  remove(id: EntryId) {
    return this.#run((entries) => entries.remove(id));
  }

  countFor(email: string) {
    return this.#run((entries) => entries.countFor(email));
  }

  removeFor(email: string) {
    return this.#run((entries) => entries.removeFor(email));
  }

  /** Deletes every entry and email still to send, for a site deleted for good. */
  async erase() {
    await this.#runtime?.dispose();
    this.#runtime = undefined;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** Sends the new entry emails that are due, and wakes again for the next one. */
  override async alarm() {
    const next = await this.#run((entries) =>
      entries.sendDue(async (email) => {
        await this.env.EMAIL.send({
          from: this.env.EMAIL_SENDER,
          to: [...email.to],
          subject: email.subject,
          text: email.text,
        });
      }),
    );
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }
}

export default {
  fetch: (request, env) =>
    new URL(request.url).pathname.startsWith(`${intakePath}/`)
      ? takeEntry(request, env)
      : Response.json({ code: "not_found", message: "Route not found." }, { status: 404 }),
} satisfies ExportedHandler<SitesApiEnv>;
