import { ChangeSet, type TokenEncoder } from "@tiptap/pm/changeset";
import { type Node, Slice } from "@tiptap/pm/model";
import { type EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { type Mapping, ReplaceStep, Transform } from "@tiptap/pm/transform";

/*
 * Brings a rich text field's TipTap editor up to a value someone else wrote,
 * without costing the person their cursor. The change is applied as the
 * smallest set of replacements between the two documents, so the cursor maps
 * through it like any edit, and it stays out of the field's undo history.
 */

/** Marks the transactions this module makes, so the field doesn't send them back as the person's edits. */
export const remoteChange = "pakshi-remote-change";

/** Compares text with its marks, and nodes with their attributes, which the default encoder ignores. */
const encoder: TokenEncoder<string> = {
  encodeCharacter: (char, marks) =>
    `${char}|${marks.map((mark) => JSON.stringify(mark.toJSON())).join()}`,
  encodeNodeStart: (node) => `<${node.type.name}|${JSON.stringify(node.attrs)}`,
  encodeNodeEnd: (node) => `>${node.type.name}`,
  compareTokens: (a, b) => a === b,
};

/**
 * The smallest replacements that turn `from` into `to`, or undefined when
 * they don't reproduce it. They run from the end of the document to its
 * start, so each one's positions are also positions in `from`.
 */
const replacements = (from: Node, to: Node) => {
  const whole = new ReplaceStep(0, from.content.size, new Slice(to.content, 0, 0));
  const { changes } = ChangeSet.create(from, undefined, encoder).addSteps(
    to,
    [whole.getMap()],
    null,
  );
  const transform = new Transform(from);
  for (const change of changes.toReversed())
    transform.replace(change.fromA, change.toA, to.slice(change.fromB, change.toB));
  return transform.doc.eq(to) ? transform : undefined;
};

/** How many characters of text come before a position. */
const textBefore = (doc: Node, position: number) => doc.textBetween(0, position, "\n", "\n").length;

/** The first position with `count` characters of text before it. */
const positionAfterText = (doc: Node, count: number) => {
  let low = 0;
  let high = doc.content.size;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (textBefore(doc, middle) < count) low = middle + 1;
    else high = middle;
  }
  return low;
};

const remote = (transaction: Transaction) =>
  transaction.setMeta("addToHistory", false).setMeta(remoteChange, true);

/**
 * A transaction that shows `next` in place of the editor's document. When
 * the smallest replacements can't reproduce it, the document is replaced
 * whole, and the cursor keeps its offset in the text.
 */
export const changeTo = (state: EditorState, next: Node): Transaction => {
  const found = replacements(state.doc, next);
  if (found !== undefined) {
    const transaction = state.tr;
    for (const step of found.steps) transaction.step(step);
    return remote(transaction);
  }
  const anchor = textBefore(state.doc, state.selection.anchor);
  const head = textBefore(state.doc, state.selection.head);
  const transaction = state.tr.replaceWith(0, state.doc.content.size, next.content);
  return remote(
    transaction.setSelection(
      TextSelection.between(
        transaction.doc.resolve(positionAfterText(transaction.doc, anchor)),
        transaction.doc.resolve(positionAfterText(transaction.doc, head)),
      ),
    ),
  );
};

/**
 * Someone else's change from `base` to `theirs`, made on the editor's
 * document, which the person changed from `base` by `mine`. It merges both,
 * so it's the person's own edit, kept out of the field's undo history.
 */
export const rebaseOnto = (state: EditorState, base: Node, theirs: Node, mine: Mapping) => {
  const transaction = state.tr.setMeta("addToHistory", false);
  const found = replacements(base, theirs);
  for (const step of found?.steps ?? []) {
    const mapped = step.map(mine);
    if (mapped !== null) transaction.maybeStep(mapped);
  }
  return transaction;
};
