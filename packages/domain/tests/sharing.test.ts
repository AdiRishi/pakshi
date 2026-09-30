import type { DraftSharing } from "@repo/contracts/sharing";
import { describe, expect, test } from "vitest";

import { draftAccess } from "../src/sharing.ts";

const priya = { id: "user_priya", name: "Priya Shah", email: "priya@pakshi.test" };

const shared = (general: DraftSharing["general"]): DraftSharing => ({
  people: [{ person: priya, access: "view" }],
  general,
});

const anonymous = { id: null } as const;
const signedIn = (id: string) => ({ id, editsSite: false });

describe("draft access", () => {
  test("people who may edit the site's pages can edit every draft", () => {
    expect(draftAccess(shared({ audience: "people", access: "view" }), { id: "user_sam", editsSite: true })).toBe("edit");
  });

  test("a draft shared with named people is open to them alone", () => {
    const sharing = shared({ audience: "people", access: "edit" });
    expect(draftAccess(sharing, signedIn(priya.id))).toBe("view");
    expect(draftAccess(sharing, signedIn("user_jonah"))).toBeNull();
    expect(draftAccess(sharing, anonymous)).toBeNull();
  });

  test("organization-wide access reaches everyone signed in, and the wider access wins", () => {
    const sharing = shared({ audience: "organization", access: "edit" });
    expect(draftAccess(sharing, signedIn("user_jonah"))).toBe("edit");
    expect(draftAccess(sharing, signedIn(priya.id))).toBe("edit");
    expect(draftAccess(sharing, anonymous)).toBeNull();
  });

  test("a link shared for editing lets anonymous visitors view", () => {
    const sharing = shared({ audience: "link", access: "edit" });
    expect(draftAccess(sharing, anonymous)).toBe("view");
    expect(draftAccess(sharing, signedIn("user_jonah"))).toBe("edit");
  });
});
