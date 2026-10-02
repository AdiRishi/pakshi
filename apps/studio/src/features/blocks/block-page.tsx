import { presentationOf } from "@repo/blocks";
import type { BlockType } from "@repo/contracts/ids";
import type { Viewer } from "@repo/contracts/studio";

import { AppShell } from "@/components/app-shell";

/** One block type's own page. */
export function BlockPage(props: { readonly viewer: Viewer; readonly type: BlockType }) {
  const presentation = presentationOf(props.type);
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{presentation.name}</h1>
        <p className="text-secondary-foreground">{presentation.summary}</p>
      </header>
    </AppShell>
  );
}
