import type { Menus } from "@repo/contracts/site";
import type { Surface, ThemeValues } from "@repo/tokens";
import type { Json } from "effect/Schema";

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

export interface Scene {
  readonly name: string;
  readonly siteName?: string;
  readonly theme: Partial<ThemeValues>;
  readonly menus?: Menus;
  readonly header: SceneBlock;
  readonly footer: SceneBlock;
  readonly sections: ReadonlyArray<SceneBlock>;
}

export const scenes: ReadonlyArray<Scene> = [];
