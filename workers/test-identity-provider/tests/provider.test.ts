import type { TestIdentityProviderEnv } from "@repo/infra/worker-bindings";
import { Schema } from "effect";
import { createLocalJWKSet, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { beforeAll, describe, expect, test } from "vitest";

import provider from "../src/index.ts";

const issuer = "https://id.test";
const redirectUri = "https://studio.test/api/auth/callback/organization";
const verifier = "a-code-verifier-that-is-long-enough-for-pkce-0123456789";
let env: TestIdentityProviderEnv;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  env = {
    SIGNING_KEY: await exportPKCS8(privateKey),
    CLIENT_ID: "studio",
    CLIENT_SECRET: "secret",
  };
});

const call = (path: string, init?: RequestInit) =>
  provider.fetch(new Request(new URL(path, issuer), init), env);

const challenge = async (value: string) =>
  btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const authorization = async () => ({
  response_type: "code",
  client_id: "studio",
  redirect_uri: redirectUri,
  scope: "openid email profile",
  state: "state-1",
  nonce: "nonce-1",
  code_challenge: await challenge(verifier),
  code_challenge_method: "S256",
});

const signIn = async (user: string) => {
  const response = await call("/authorize", {
    method: "POST",
    body: new URLSearchParams({ ...(await authorization()), user }),
  });
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location") ?? "");
  expect(`${location.origin}${location.pathname}`).toBe(redirectUri);
  expect(location.searchParams.get("state")).toBe("state-1");
  return location.searchParams.get("code") ?? "";
};

const exchange = (code: string, options: { verifier?: string; secret?: string } = {}) =>
  call("/token", {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`studio:${options.secret ?? "secret"}`)}` },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: options.verifier ?? verifier,
    }),
  });

test("the authorize page offers every test user", async () => {
  const response = await call(
    `/authorize?${new URLSearchParams(await authorization()).toString()}`,
  );
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const name of ["Meera Kapoor", "Sam Okafor", "Jonah Reyes"]) expect(html).toContain(name);
});

test("a code exchanges for an ID token the published keys verify", async () => {
  const response = await exchange(await signIn("user_sam"));
  expect(response.status).toBe(200);
  const tokens = Schema.decodeUnknownSync(
    Schema.Struct({ id_token: Schema.String, access_token: Schema.String }),
  )(await response.json());
  const jwks = createLocalJWKSet(await (await call("/jwks")).json());
  const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer, audience: "studio" });
  expect(payload).toMatchObject({
    sub: "user_sam",
    email: "sam.okafor@pakshi.test",
    nonce: "nonce-1",
  });
  const userinfo = await call("/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(await userinfo.json()).toMatchObject({ sub: "user_sam", name: "Sam Okafor" });
});

describe("the token endpoint refuses", () => {
  test("a verifier that doesn't match the challenge", async () => {
    const response = await exchange(await signIn("user_sam"), { verifier: `${verifier}x` });
    expect(await response.json()).toEqual({ error: "invalid_grant" });
  });

  test("the wrong client secret", async () => {
    const response = await exchange(await signIn("user_sam"), { secret: "guess" });
    expect(response.status).toBe(401);
  });

  test("a forged code", async () => {
    const response = await exchange("not-a-code");
    expect(await response.json()).toEqual({ error: "invalid_grant" });
  });
});

test("discovery points at this provider's endpoints", async () => {
  expect(await (await call("/.well-known/openid-configuration")).json()).toMatchObject({
    issuer,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    code_challenge_methods_supported: ["S256"],
  });
});
