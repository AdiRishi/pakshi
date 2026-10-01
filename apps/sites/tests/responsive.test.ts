import { MediaId } from "@repo/contracts/ids";
import { describe, expect, test } from "vitest";

import { responsiveImage } from "../src/lib/responsive.ts";

describe("a library image as blocks render it", () => {
  test("offers every served width smaller than the image, and the image itself", () => {
    expect(
      responsiveImage(MediaId.make("med_harbour"), {
        contentType: "image/jpeg",
        width: 1600,
        height: 1067,
      }).srcSet,
    ).toBe(
      "/_media/med_harbour?width=480 480w, /_media/med_harbour?width=960 960w, /_media/med_harbour 1600w",
    );
  });
});
