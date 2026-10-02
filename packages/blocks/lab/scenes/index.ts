import type { Menus } from "@repo/contracts/site";
import type { Surface } from "@repo/tokens";
import type { Json } from "effect/Schema";

import { landing } from "./landing.ts";

export interface SceneBlock {
  readonly type: string;
  readonly variant: string;
  readonly surface?: Surface;
  readonly props: Readonly<Record<string, Json>>;
  readonly slots?: Readonly<
    Record<
      string,
      ReadonlyArray<{
        readonly type: string;
        readonly variant: string;
        readonly props: Readonly<Record<string, Json>>;
      }>
    >
  >;
}

/** A whole page: its site's name and menus, header, sections and footer. */
export interface Scene {
  readonly name: string;
  readonly siteName?: string;
  readonly menus?: Menus;
  readonly header: SceneBlock;
  readonly footer: SceneBlock;
  readonly sections: ReadonlyArray<SceneBlock>;
}

export const scenes: ReadonlyArray<Scene> = [landing];
