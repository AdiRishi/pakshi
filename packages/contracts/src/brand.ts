import { BrandTheme, ResolvedTheme } from "@repo/tokens";
import { Schema } from "effect";

import { BrandId, MediaId } from "./ids.ts";

/** A brand's logos and browser tab icon, each an image in the brand's media library. */
export const BrandIdentity = Schema.Struct({
  logo: Schema.NullOr(MediaId),
  /** The logo for dark backgrounds: the dark color scheme and dark surfaces. */
  logoOnDark: Schema.NullOr(MediaId),
  favicon: Schema.NullOr(MediaId),
});
export type BrandIdentity = typeof BrandIdentity.Type;

export const noIdentity: BrandIdentity = { logo: null, logoOnDark: null, favicon: null };

/**
 * One saved version of a brand's look: its theme, resolved, and its identity.
 * Revisions never change. Each draft pins one the way its lockfile pins block
 * versions, and carries it, so a brand's later changes reach a site only
 * through a draft that moves the pin.
 */
export const BrandRevision = Schema.Struct({
  brand: BrandId,
  /** The brand's revisions count up from 1, so a later one is always the larger number. */
  number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  theme: ResolvedTheme,
  identity: BrandIdentity,
});
export type BrandRevision = typeof BrandRevision.Type;

/** A brand's guide to the words Pakshi's agent writes on its sites. */
export const VoiceGuide = Schema.Struct({
  tone: Schema.String.check(Schema.isMaxLength(1000)),
  /** Pairs of how to say something and how not to. */
  examples: Schema.Array(
    Schema.Struct({
      write: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300)),
      avoid: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300)),
    }),
  ).check(Schema.isMaxLength(20)),
  wordsToAvoid: Schema.Array(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40)),
  ).check(Schema.isMaxLength(100)),
});
export type VoiceGuide = typeof VoiceGuide.Type;

export const emptyVoiceGuide: VoiceGuide = { tone: "", examples: [], wordsToAvoid: [] };

/** A brand's theme and identity as its admins last saved them, which its newest revision holds. */
export const BrandLook = Schema.Struct({ theme: BrandTheme, identity: BrandIdentity });
export type BrandLook = typeof BrandLook.Type;
