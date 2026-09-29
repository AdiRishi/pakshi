/*
 * How a change someone else made to a text field meets the person editing
 * it. A field's value is replaced whole, so the change is found by comparing
 * the old text with the new: the text that differs between their common
 * start and common end.
 */

/** The span that differs between two texts: where it starts, and how much of each text follows it. */
const changedSpan = (before: string, after: string) => {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start])
    start += 1;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end += 1;
  return { start, beforeEnd: before.length - end, afterEnd: after.length - end };
};

/**
 * Where a position in `before` is in `after`. A position before the change
 * stays, one after it moves with the text around it, and one inside text that
 * was replaced goes to the end of the new text.
 */
export const mapOffset = (before: string, after: string, offset: number) => {
  const { start, beforeEnd, afterEnd } = changedSpan(before, after);
  if (offset <= start) return offset;
  if (offset >= beforeEnd) return offset + after.length - before.length;
  return afterEnd;
};

/**
 * The person's change from `base` to `mine`, made again on `theirs`, a
 * version of `base` someone else changed meanwhile.
 */
export const rebaseText = (base: string, mine: string, theirs: string) => {
  const { start, beforeEnd, afterEnd } = changedSpan(base, mine);
  const from = mapOffset(base, theirs, start);
  const to = Math.max(from, mapOffset(base, theirs, beforeEnd));
  return theirs.slice(0, from) + mine.slice(start, afterEnd) + theirs.slice(to);
};
