import { describe, expect, test } from "vitest";

import { mapOffset, rebaseText } from "../src/text-changes.ts";

describe("a caret in text someone else changed", () => {
  test("before the change stays where it is", () => {
    expect(mapOffset("Summer school", "Summer school at sea", 6)).toBe(6);
  });

  test("after the change moves with the text around it", () => {
    // After "Summer" in "Summer school", then "Our " is added at the start.
    expect(mapOffset("Summer school", "Our Summer school", 6)).toBe(10);
  });

  test("after deleted text moves back with it", () => {
    expect(mapOffset("The Summer school", "Summer school", 10)).toBe(6);
  });

  test("inside replaced text goes to the end of what replaced it", () => {
    // "Summ" became "Wint"; the rest of the word is the same on both sides.
    expect(mapOffset("Summer school", "Winter school", 2)).toBe(4);
  });
});

describe("the person's typing made again on text someone else changed", () => {
  test("keeps both changes when they touch different parts", () => {
    expect(rebaseText("Summer school", "Summer school 2027", "Our Summer school")).toBe(
      "Our Summer school 2027",
    );
  });

  test("keeps a deletion", () => {
    expect(rebaseText("The Summer school", "Summer school", "The Summer school at sea")).toBe(
      "Summer school at sea",
    );
  });

  test("with no change on the other side is the person's text", () => {
    expect(rebaseText("Summer", "Summers", "Summer")).toBe("Summers");
  });
});
