import { expect, test } from "vitest";

import { fixture, showEditing } from "./support.tsx";

/** What a click at the middle of an element lands on. */
const clicked = (element: Element) => {
  const box = element.getBoundingClientRect();
  return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
};

test.each([
  ["card", "default", "text"],
  ["team-member", "default", "bio"],
  ["bento-tile", "image", "body"],
])(
  "in the editor, a linked %s's %s field is what a click on it reaches",
  async (type, name, field) => {
    const screen = await showEditing(fixture(type, name));
    const element = screen.container.querySelector(`[data-field="${field}"]`);
    if (element === null) throw new Error(`The ${type} fixture shows no ${field}.`);
    expect(clicked(element)?.closest("[data-field]")).toBe(element);
  },
);
