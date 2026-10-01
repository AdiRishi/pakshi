import { Option, Schema } from "effect";
import { describe, expect, test } from "vitest";

import { Hostname } from "../src/studio.ts";

const decode = (typed: string) => Option.getOrNull(Schema.decodeOption(Hostname)(typed));

describe("a site's own domain", () => {
  test("is kept lowercase, without a trailing dot or spaces", () => {
    expect(decode(" WWW.NorthbankLibraries.org. ")).toBe("www.northbanklibraries.org");
    expect(decode("kids.northbank.localhost")).toBe("kids.northbank.localhost");
  });

  test("needs a word before the domain, and labels a browser can reach", () => {
    expect(decode("northbanklibraries.org")).toBeNull();
    expect(decode("-www.northbanklibraries.org")).toBeNull();
    expect(decode("www..northbanklibraries.org")).toBeNull();
    expect(decode("https://www.northbanklibraries.org")).toBeNull();
  });
});
