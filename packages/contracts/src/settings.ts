import { Schema, Struct } from "effect";

import { EmailAddress } from "./email.ts";
import { FormId } from "./ids.ts";
import { MediaRef } from "./references.ts";

/*
 * A site's settings, as one registry. SiteDoc keeps a site's values, outside
 * any draft; anything nobody has set reads as its default. A new setting is a
 * field in one of the two groups below, which says how a saved value reaches
 * the site, and its default.
 */

export const SiteName = Schema.Trim.check(
  Schema.isMinLength(1, { message: "Name the site" }),
  Schema.isMaxLength(80, { message: "Use at most 80 characters" }),
);

/**
 * Settings that change what visitors see. Freezing copies them into the
 * snapshot, so they go live with the next publish, and a rollback brings
 * back the values its release had.
 */
const published = {
  /** The end of every page's title. */
  name: SiteName,
  /** The image shared pages show when they have no hero image of their own. */
  sharingImage: Schema.NullOr(MediaRef),
};

/**
 * Settings that change how the site runs. They take effect as soon as
 * they're saved, in the runtime that reads them.
 */
const live = {
  /** Where each form's new entries are emailed. */
  formEmails: Schema.Record(FormId, Schema.Array(EmailAddress)),
};

export const SiteSettings = Schema.Struct({ ...published, ...live });
export type SiteSettings = typeof SiteSettings.Type;

export const settingDefaults: SiteSettings = { name: "", sharingImage: null, formEmails: {} };

/** Some settings' new values, as a save carries them. */
export const SettingsChanges = SiteSettings.mapFields(Struct.map(Schema.optionalKey));
export type SettingsChanges = typeof SettingsChanges.Type;

/** The settings a snapshot holds, as they were when it was frozen. */
export const PublishedSettings = Schema.Struct(published);
export type PublishedSettings = typeof PublishedSettings.Type;

export const LiveSettings = Schema.Struct(live);
export type LiveSettings = typeof LiveSettings.Type;

/** The settings a snapshot holds, from all of a site's settings. */
export const publishedOf = (settings: SiteSettings): PublishedSettings =>
  Schema.decodeSync(PublishedSettings)(settings);

/** The settings that take effect at once, from all of a site's settings. */
export const liveOf = (settings: SiteSettings): LiveSettings =>
  Schema.decodeSync(LiveSettings)(settings);

/** The forms whose new entries the settings email to someone. */
export const notifiedForms = (settings: LiveSettings): ReadonlySet<FormId> =>
  new Set(
    Object.entries(settings.formEmails).flatMap(([form, to]) =>
      to.length > 0 ? [FormId.make(form)] : [],
    ),
  );

/** A site's settings as the settings screens show them, with the revision a save starts from. */
export const SettingsView = Schema.Struct({ settings: SiteSettings, revision: Schema.Int });
export type SettingsView = typeof SettingsView.Type;
