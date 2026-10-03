import { expect, onTestFinished, test } from "vitest";

import { fixture, show } from "./support.tsx";

const withFigures = () => {
  const tree = fixture("stats", "row-centered");
  return {
    ...tree,
    props: {
      ...tree.props,
      stats: [
        { id: "it_people", value: "3,400+", label: "People who came" },
        { id: "it_boats", value: "6", label: "Boats launched" },
      ],
    },
  };
};

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

test("a figure reads as written until it scrolls into view, then counts up to it", async () => {
  const spacer = document.createElement("div");
  spacer.style.height = "300vh";
  document.body.prepend(spacer);
  onTestFinished(() => spacer.remove());

  const screen = await show(withFigures());
  const figure = screen.getByRole("definition").first();
  await frame();
  await frame();
  expect(figure.element().textContent).toBe("3,400+");

  figure.element().scrollIntoView();
  await expect.poll(() => figure.element().textContent).not.toBe("3,400+");
  await expect.poll(() => figure.element().textContent, { timeout: 10_000 }).toBe("3,400+");
}, 15_000);
