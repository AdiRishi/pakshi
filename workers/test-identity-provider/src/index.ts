import type { TestIdentityProviderEnv } from "@repo/infra/worker-bindings";
import { Predicate, Schema } from "effect";
import {
  base64url,
  exportJWK,
  importJWK,
  importPKCS8,
  type JWTPayload,
  jwtVerify,
  SignJWT,
} from "jose";

import { type TestUser, testUsers } from "./users.ts";

const algorithm = "ES256";

const AuthorizeRequest = Schema.Struct({
  response_type: Schema.Literal("code"),
  client_id: Schema.String,
  redirect_uri: Schema.String.check(Schema.makeFilter((value) => URL.canParse(value))),
  scope: Schema.String,
  state: Schema.optionalKey(Schema.String),
  nonce: Schema.optionalKey(Schema.String),
  code_challenge: Schema.String,
  code_challenge_method: Schema.Literal("S256"),
});
type AuthorizeRequest = typeof AuthorizeRequest.Type;

const Approval = Schema.Struct({ ...AuthorizeRequest.fields, user: Schema.String });

const TokenRequest = Schema.Struct({
  grant_type: Schema.Literal("authorization_code"),
  code: Schema.String,
  redirect_uri: Schema.String,
  code_verifier: Schema.String,
  client_id: Schema.optionalKey(Schema.String),
  client_secret: Schema.optionalKey(Schema.String),
});

const CodeClaims = Schema.Struct({
  sub: Schema.String,
  redirect_uri: Schema.String,
  code_challenge: Schema.String,
  nonce: Schema.optionalKey(Schema.String),
});

const html = (value: string) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

const error = (status: number, code: string) => Response.json({ error: code }, { status });

const signingKey = async (env: TestIdentityProviderEnv) => {
  const privateKey = await importPKCS8(env.SIGNING_KEY, algorithm, { extractable: true });
  const { d: _private, ...publicJwk } = await exportJWK(privateKey);
  const publicKey = await importJWK(publicJwk, algorithm);
  return {
    privateKey,
    publicKey,
    publicJwk: { ...publicJwk, kid: "test", alg: algorithm, use: "sig" },
  };
};

const userById = (id: string) => testUsers.find((user) => user.id === id);

const claimsFor = (user: TestUser) => ({
  email: user.email,
  email_verified: true,
  name: user.name,
});

const chooserPage = (request: AuthorizeRequest) => {
  const hidden = Object.entries(request)
    .map(([name, value]) => `<input type="hidden" name="${html(name)}" value="${html(value)}">`)
    .join("");
  const choices = testUsers
    .map(
      (user) =>
        `<form method="post" action="/authorize">${hidden}<input type="hidden" name="user" value="${html(user.id)}"><button>${html(user.name)}</button></form>`,
    )
    .join("");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Choose a test account</title></head><body><main><h1>Choose a test account</h1><p>This identity provider exists only in the dev stack and in tests.</p>${choices}</main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};

const clientCredentials = (request: Request, body: typeof TokenRequest.Type) => {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [id = "", secret = ""] = atob(header.slice("Basic ".length))
      .split(":")
      .map(decodeURIComponent);
    return { id, secret };
  }
  return { id: body.client_id ?? "", secret: body.client_secret ?? "" };
};

const challengeFor = async (verifier: string) =>
  base64url.encode(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );

const formEntries = async (request: Request) =>
  Object.fromEntries(
    Array.from(await request.formData()).flatMap(([name, value]) =>
      Predicate.isString(value) ? [[name, value] as const] : [],
    ),
  );

const handle = async (request: Request, env: TestIdentityProviderEnv) => {
  const url = new URL(request.url);
  const issuer = url.origin;
  const key = await signingKey(env);
  const sign = (claims: JWTPayload, audience: string, lifetime: string) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: algorithm, kid: key.publicJwk.kid })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(lifetime)
      .sign(key.privateKey);
  const verify = (token: string, audience: string) =>
    jwtVerify(token, key.publicKey, { issuer, audience, algorithms: [algorithm] });

  if (url.pathname === "/.well-known/openid-configuration") {
    return Response.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: [algorithm],
      scopes_supported: ["openid", "email", "profile"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    });
  }
  if (url.pathname === "/jwks") return Response.json({ keys: [key.publicJwk] });

  if (url.pathname === "/authorize" && request.method === "GET") {
    const authorize = Schema.decodeUnknownOption(AuthorizeRequest)(
      Object.fromEntries(url.searchParams),
    );
    if (authorize._tag === "None" || authorize.value.client_id !== env.CLIENT_ID)
      return error(400, "invalid_request");
    return chooserPage(authorize.value);
  }

  if (url.pathname === "/authorize" && request.method === "POST") {
    const approval = Schema.decodeUnknownOption(Approval)(await formEntries(request));
    if (approval._tag === "None" || approval.value.client_id !== env.CLIENT_ID)
      return error(400, "invalid_request");
    const user = userById(approval.value.user);
    if (user === undefined) return error(400, "invalid_request");
    const claims = {
      sub: user.id,
      redirect_uri: approval.value.redirect_uri,
      code_challenge: approval.value.code_challenge,
      nonce: approval.value.nonce,
    } satisfies JWTPayload;
    const code = await sign(claims, `${env.CLIENT_ID}:code`, "60s");
    const redirect = new URL(approval.value.redirect_uri);
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("iss", issuer);
    if (approval.value.state !== undefined)
      redirect.searchParams.set("state", approval.value.state);
    return Response.redirect(redirect.href, 302);
  }

  if (url.pathname === "/token" && request.method === "POST") {
    const token = Schema.decodeUnknownOption(TokenRequest)(await formEntries(request));
    if (token._tag === "None") return error(400, "invalid_request");
    const client = clientCredentials(request, token.value);
    if (client.id !== env.CLIENT_ID || client.secret !== env.CLIENT_SECRET)
      return error(401, "invalid_client");
    const verified = await verify(token.value.code, `${env.CLIENT_ID}:code`).catch(() => null);
    const code = Schema.decodeUnknownOption(CodeClaims)(verified?.payload);
    if (
      code._tag === "None" ||
      code.value.redirect_uri !== token.value.redirect_uri ||
      code.value.code_challenge !== (await challengeFor(token.value.code_verifier))
    )
      return error(400, "invalid_grant");
    const user = userById(code.value.sub);
    if (user === undefined) return error(400, "invalid_grant");
    const idClaims = {
      sub: user.id,
      ...claimsFor(user),
      nonce: code.value.nonce,
    } satisfies JWTPayload;
    return Response.json({
      access_token: await sign({ sub: user.id }, `${issuer}/userinfo`, "5m"),
      id_token: await sign(idClaims, env.CLIENT_ID, "5m"),
      token_type: "Bearer",
      expires_in: 300,
    });
  }

  if (url.pathname === "/userinfo") {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const verified = await verify(bearer, `${issuer}/userinfo`).catch(() => null);
    const user = userById(verified?.payload.sub ?? "");
    if (user === undefined) return error(401, "invalid_token");
    return Response.json({ sub: user.id, ...claimsFor(user) });
  }

  return error(404, "not_found");
};

/**
 * A minimal OpenID Connect provider for the dev stack and tests. Anyone who
 * reaches it can sign in as one of the test users, so production never deploys it.
 */
export default {
  fetch: handle,
} satisfies ExportedHandler<TestIdentityProviderEnv>;
