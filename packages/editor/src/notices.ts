import type { Draft } from "@repo/contracts/draft";
import type { BatchError, Op } from "@repo/contracts/ops";
import type { BlockContracts } from "@repo/domain/document";

/** Something the editor tells the person, such as a change someone else replaced. */
export interface Notice {
  readonly title: string;
  readonly description?: string;
}

const metaTitles: Readonly<Record<Extract<Op, { op: "setMeta" }>["field"], string>> = {
  title: "title",
  description: "description",
  date: "date",
  author: "author",
  tags: "tags",
  excerpt: "excerpt",
  cover: "cover image",
};

/** The part of the draft an op changes, in words, such as "Heading in Hero". */
export const partChanged = (op: Op, draft: Draft, contracts: BlockContracts) => {
  switch (op.op) {
    case "setProp":
    case "setVariant":
    case "setSurface": {
      const holder = op.target === "site" ? draft.parts : draft.pages[op.target];
      const block = holder?.blocks[op.block];
      const contract = block === undefined ? undefined : contracts.get(block.type);
      const blockTitle = contract?.title ?? "a block";
      if (op.op === "setVariant") return `the layout of ${blockTitle}`;
      if (op.op === "setSurface") return `the background of ${blockTitle}`;
      const [name] = op.path;
      const field = name === undefined ? undefined : contract?.fields[name];
      return `${field?.title ?? "a field"} in ${blockTitle}`;
    }
    case "setMeta":
      return `the page's ${metaTitles[op.field]}`;
    case "setPath":
      return "the page's address";
    case "insertBlock":
    case "moveBlock":
    case "removeBlock":
      return "the page's sections";
    case "createPage":
    case "deletePage":
      return "the site's pages";
    case "rebase":
      return "the site";
  }
};

export const describeErrors = (errors: ReadonlyArray<BatchError>) =>
  errors.map((error) => error.message).join(" ");
