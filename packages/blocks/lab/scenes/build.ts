import type { Json } from "effect/Schema";

import type { SceneBlock } from "./index.ts";

/*
 * Helpers that keep the lab's scenes short: content as the blocks store it.
 */

let counter = 0;
const id = (prefix: string) => {
  counter += 1;
  return `it_${prefix}${counter}`;
};

export const doc = (...paragraphs: ReadonlyArray<string>): Json => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

export const image = (mediaId: string, alt = ""): Json => ({ $ref: "media", id: mediaId, alt });

export const link = (label: string, href = "https://example.org"): Json => ({ label, link: href });

export const buttons = (...labels: ReadonlyArray<string>): Json =>
  labels.map((label) => ({ id: id("button"), button: link(label) }));

export const list = (name: string, items: ReadonlyArray<Readonly<Record<string, Json>>>): Json =>
  items.map((item) => ({ id: id(name), ...item }));

export const item = (type: string, props: Readonly<Record<string, Json>>, variant = "default") => ({
  type,
  variant,
  props,
});

export const block = (
  type: string,
  variant: string,
  surface: SceneBlock["surface"],
  props: Readonly<Record<string, Json>>,
  slots?: SceneBlock["slots"],
): SceneBlock => ({
  type,
  variant,
  ...(surface !== undefined && { surface }),
  props,
  ...(slots !== undefined && { slots }),
});

export const menu = (...labels: ReadonlyArray<string>) =>
  labels.map((label, index) => ({
    id: `mi_${index}${label.replaceAll(" ", "")}`,
    label,
    target: "https://example.org",
  }));
