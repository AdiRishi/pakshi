import type { DefaultRole, Permission, Scope } from "@repo/contracts/access";
import { BrandId, CustomRoleId, SiteId } from "@repo/contracts/ids";
import { describe, expect, test } from "vitest";

import {
  type Access,
  authorize,
  defaultRoles,
  type Grant,
  mayDefineRole,
  mayGrant,
  mayOverride,
  type Resource,
  rolesOn,
} from "../src/access.ts";

const brandA = BrandId.make("brand_a");
const brandB = BrandId.make("brand_b");
const siteA1 = SiteId.make("site_a1");
const siteA2 = SiteId.make("site_a2");
const siteB1 = SiteId.make("site_b1");

const grant = (role: DefaultRole, scope: Scope): Grant => ({
  role,
  permissions: defaultRoles[role],
  scope,
});

// The default roles table from the product spec, one row per line.
const table: ReadonlyArray<readonly [ReadonlyArray<Permission>, ReadonlyArray<DefaultRole>]> = [
  [["brand.create", "roles.manage", "org.settings.edit", "brand.delete"], ["org-admin"]],
  [["brand.theme.edit"], ["org-admin", "brand-admin"]],
  [
    ["site.create", "site.delete"],
    ["org-admin", "brand-admin"],
  ],
  [
    ["site.settings.edit", "members.manage"],
    ["org-admin", "brand-admin", "site-admin"],
  ],
  [["workflow.edit"], ["org-admin", "brand-admin"]],
  [
    ["page.edit", "draft.share"],
    ["org-admin", "brand-admin", "site-admin", "editor"],
  ],
  [["site.publish"], ["org-admin", "brand-admin", "site-admin", "editor"]],
  [["site.approve"], ["org-admin", "approver"]],
  [["site.approve_own"], ["org-admin"]],
  [
    ["site.rollback", "blocks.upgrade"],
    ["org-admin", "brand-admin", "site-admin", "editor"],
  ],
  [
    ["submissions.read", "submissions.export"],
    ["org-admin", "brand-admin", "site-admin", "submissions-viewer"],
  ],
  [["blocks.request"], ["org-admin", "brand-admin", "site-admin", "editor"]],
];

const resources: ReadonlyArray<readonly [string, Resource]> = [
  ["the organization", { kind: "organization" }],
  ["brand A", { kind: "brand", id: brandA }],
  ["site A1", { kind: "site", id: siteA1, brand: brandA }],
  ["site A2", { kind: "site", id: siteA2, brand: brandA }],
  ["brand B", { kind: "brand", id: brandB }],
  ["site B1", { kind: "site", id: siteB1, brand: brandB }],
];

const grantScopes: ReadonlyArray<readonly [string, Scope, ReadonlyArray<string>]> = [
  ["the organization", { kind: "organization" }, resources.map(([name]) => name)],
  ["brand A", { kind: "brand", id: brandA }, ["brand A", "site A1", "site A2"]],
  ["site A1", { kind: "site", id: siteA1 }, ["site A1"]],
];

const roles = [
  "org-admin",
  "brand-admin",
  "site-admin",
  "editor",
  "approver",
  "submissions-viewer",
] as const satisfies ReadonlyArray<DefaultRole>;

describe.each(roles)("%s", (role) => {
  test.each(grantScopes)("granted on %s", (_, scope, covered) => {
    const access: Access = { grants: [grant(role, scope)], overrides: [] };
    for (const [permissions, holders] of table) {
      for (const permission of permissions) {
        for (const [name, resource] of resources) {
          const expected = holders.includes(role) && covered.includes(name);
          expect(authorize(access, permission, resource), `${permission} on ${name}`).toBe(
            expected,
          );
        }
      }
    }
  });
});

const siteA1Resource: Resource = { kind: "site", id: siteA1, brand: brandA };
const siteA2Resource: Resource = { kind: "site", id: siteA2, brand: brandA };

describe("overrides", () => {
  test("a denial on one site beats a role granted on its brand", () => {
    const access: Access = {
      grants: [grant("brand-admin", { kind: "brand", id: brandA })],
      overrides: [{ permission: "page.edit", scope: { kind: "site", id: siteA1 }, allowed: false }],
    };
    expect(authorize(access, "page.edit", siteA1Resource)).toBe(false);
    expect(authorize(access, "draft.share", siteA1Resource)).toBe(true);
    expect(authorize(access, "page.edit", siteA2Resource)).toBe(true);
  });

  test("an allowance gives a permission no role holds", () => {
    const access: Access = {
      grants: [grant("approver", { kind: "site", id: siteA1 })],
      overrides: [
        { permission: "site.approve_own", scope: { kind: "site", id: siteA1 }, allowed: true },
      ],
    };
    expect(authorize(access, "site.approve_own", siteA1Resource)).toBe(true);
    expect(authorize(access, "site.approve_own", siteA2Resource)).toBe(false);
  });

  test("the most specific override wins", () => {
    const access: Access = {
      grants: [],
      overrides: [
        { permission: "page.edit", scope: { kind: "brand", id: brandA }, allowed: false },
        { permission: "page.edit", scope: { kind: "site", id: siteA1 }, allowed: true },
        { permission: "page.edit", scope: { kind: "organization" }, allowed: true },
      ],
    };
    expect(authorize(access, "page.edit", siteA1Resource)).toBe(true);
    expect(authorize(access, "page.edit", siteA2Resource)).toBe(false);
    expect(authorize(access, "page.edit", { kind: "brand", id: brandB })).toBe(true);
  });
});

test("a person holds on a site the roles granted on it, its brand or the organization", () => {
  const access: Access = {
    grants: [
      grant("approver", { kind: "brand", id: brandA }),
      grant("editor", { kind: "site", id: siteB1 }),
      grant("submissions-viewer", { kind: "organization" }),
      grant("site-admin", { kind: "site", id: siteA2 }),
    ],
    overrides: [],
  };
  expect(rolesOn(access, siteA1Resource)).toEqual(["approver", "submissions-viewer"]);
});

test("a custom role gives exactly the permissions it holds now", () => {
  const reviewer = CustomRoleId.make("role_reviewer");
  const access: Access = {
    grants: [
      {
        role: reviewer,
        permissions: ["page.edit", "site.approve"],
        scope: { kind: "brand", id: brandA },
      },
    ],
    overrides: [],
  };
  expect(authorize(access, "site.approve", siteA1Resource)).toBe(true);
  expect(authorize(access, "site.publish", siteA1Resource)).toBe(false);
  expect(authorize(access, "site.approve", { kind: "site", id: siteB1, brand: brandB })).toBe(
    false,
  );
  expect(rolesOn(access, siteA1Resource)).toEqual([reviewer]);
});

describe("delegation", () => {
  const brandAdmin: Access = {
    grants: [grant("brand-admin", { kind: "brand", id: brandA })],
    overrides: [],
  };
  const siteB1Resource: Resource = { kind: "site", id: siteB1, brand: brandB };

  test("no one can give a role holding a permission they don't hold", () => {
    expect(mayGrant(brandAdmin, defaultRoles.editor, siteA1Resource)).toBe(true);
    expect(mayGrant(brandAdmin, defaultRoles.approver, siteA1Resource)).toBe(false);
    expect(mayGrant(brandAdmin, defaultRoles["org-admin"], { kind: "brand", id: brandA })).toBe(
      false,
    );
  });

  test("no one can give access on a scope they don't control", () => {
    expect(mayGrant(brandAdmin, defaultRoles.editor, siteB1Resource)).toBe(false);
    expect(mayGrant(brandAdmin, defaultRoles.editor, { kind: "organization" })).toBe(false);
    const editor: Access = {
      grants: [grant("editor", { kind: "site", id: siteA1 })],
      overrides: [],
    };
    expect(mayGrant(editor, ["page.edit"], siteA1Resource)).toBe(false);
  });

  test("an override needs the permission it switches and control of its scope", () => {
    expect(mayOverride(brandAdmin, "submissions.read", siteA1Resource)).toBe(true);
    expect(mayOverride(brandAdmin, "site.approve_own", siteA1Resource)).toBe(false);
    expect(mayOverride(brandAdmin, "submissions.read", siteB1Resource)).toBe(false);
  });

  test("a permission switched off for someone is one they can no longer give", () => {
    const limited: Access = {
      grants: brandAdmin.grants,
      overrides: [
        { permission: "submissions.export", scope: { kind: "site", id: siteA1 }, allowed: false },
      ],
    };
    expect(mayGrant(limited, defaultRoles["submissions-viewer"], siteA1Resource)).toBe(false);
    expect(mayGrant(limited, defaultRoles["submissions-viewer"], siteA2Resource)).toBe(true);
  });

  test("defining a role needs roles.manage and every permission it holds across the organization", () => {
    const orgAdmin: Access = {
      grants: [grant("org-admin", { kind: "organization" })],
      overrides: [],
    };
    expect(mayDefineRole(orgAdmin, ["page.edit", "site.approve_own"])).toBe(true);
    expect(mayDefineRole(brandAdmin, ["page.edit"])).toBe(false);
    const withoutOwnApproval: Access = {
      grants: orgAdmin.grants,
      overrides: [
        { permission: "site.approve_own", scope: { kind: "organization" }, allowed: false },
      ],
    };
    expect(mayDefineRole(withoutOwnApproval, ["site.approve_own"])).toBe(false);
  });
});
