import { BrandLook, VoiceGuide } from "@repo/contracts/brand";
import { BrandId } from "@repo/contracts/ids";
import { BrandName } from "@repo/contracts/studio";
import { HexColor, PresetId } from "@repo/tokens";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { studio } from "@/server/studio";

/** The brands the person holds a permission on. */
export const getBrands = createServerFn({ method: "GET" }).handler(() =>
  studio((client) => client.brands()),
);

/** A brand's look, voice guide, sites and library. */
export const getBrand = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ brand: BrandId })))
  .handler(({ data }) => studio((client) => client.brand(data)));

/** Saves a brand's theme and identity as its next revision, which reaches each site as a draft. */
export const saveBrandLook = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ brand: BrandId, look: BrandLook, seen: Schema.Int })),
  )
  .handler(({ data }) => studio((client) => client.saveBrandLook(data)));

export const saveVoiceGuide = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ brand: BrandId, voice: VoiceGuide })))
  .handler(({ data }) => studio((client) => client.saveVoiceGuide(data)));

/** Makes a brand from a preset and a brand color. */
export const createBrand = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ name: BrandName, preset: PresetId, brandColor: HexColor }),
    ),
  )
  .handler(({ data }) => studio((client) => client.createBrand(data)));

/** Deletes a brand that has no sites. */
export const deleteBrand = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ brand: BrandId })))
  .handler(({ data }) => studio((client) => client.deleteBrand(data)));
