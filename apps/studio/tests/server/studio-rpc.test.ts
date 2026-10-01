import { AppRequestError } from "@repo/contracts/app";
import { SiteId } from "@repo/contracts/ids";
import { rpcWebHandler } from "@repo/contracts/rpc/server";
import {
  SignedIn,
  StudioAddress,
  StudioRpcs,
  StudioSession,
  StudioUnavailable,
  Unauthenticated,
  type Viewer,
  Visitor,
  VisitorSession,
} from "@repo/contracts/studio";
import { Effect, Layer } from "effect";
import { describe, expect, test } from "vitest";

import { callStudio } from "@/server/studio-rpc";

const sam = { id: "user_sam", name: "Sam Okafor", email: "sam.okafor@pakshi.test" };

type Behaviour = "answer" | "unavailable" | "defect" | "hang";

const onlyViewer = "These tests call only viewer.";

/** A stand-in studio-api serving the real contract. Its only valid session cookie is `session=sam`. */
const fakeStudioApi = (behaviour: Behaviour) => {
  const seen: Array<string | undefined> = [];
  const session = Layer.succeed(StudioSession)(
    StudioSession.of((effect, { headers }) => {
      seen.push(headers["x-studio-origin"]);
      return headers.cookie === "session=sam"
        ? effect.pipe(
            Effect.provideService(SignedIn, sam),
            Effect.provideService(StudioAddress, headers["x-studio-origin"] ?? ""),
          )
        : Effect.fail(new Unauthenticated({}));
    }),
  );
  const visitor = Layer.succeed(VisitorSession)(
    VisitorSession.of((effect) =>
      effect.pipe(Effect.provideService(Visitor, null), Effect.provideService(StudioAddress, "")),
    ),
  );
  const answer = SignedIn.use((user): Effect.Effect<Viewer> =>
    Effect.succeed({
      user,
      organization: "Harbour Schools",
      roles: [{ role: "Editor", scope: "Harbour Summer School" }],
      sites: [
        {
          id: SiteId.make("site_harbour"),
          name: "Harbour Summer School",
          brand: "Harbour Schools",
        },
      ],
      approvalsWaiting: 0,
      brands: false,
      can: { createBrand: false, createSite: false, invite: false },
    }),
  );
  const unused = () => Effect.die(new Error(onlyViewer));
  const handlers = StudioRpcs.toLayer({
    viewer: () => {
      switch (behaviour) {
        case "answer":
          return answer;
        case "unavailable":
          return Effect.fail(new StudioUnavailable({ operation: "viewer" }));
        case "defect":
          return Effect.die(new Error("private database details"));
        case "hang":
          return Effect.never;
      }
    },
    organization: unused,
    invitation: unused,
    organizationPeople: unused,
    invite: unused,
    revokeInvitation: unused,
    acceptInvitation: unused,
    createBrand: unused,
    newSiteOptions: unused,
    createSite: unused,
    home: unused,
    people: unused,
    siteSettings: unused,
    saveSiteSettings: unused,
    siteDomains: unused,
    addDomain: unused,
    checkDomains: unused,
    removeDomain: unused,
    mediaLibrary: unused,
    saveAltText: unused,
    siteEntries: unused,
    formEntries: unused,
    formEntry: unused,
    exportEntries: unused,
    deleteEntry: unused,
    entriesFrom: unused,
    deleteEntriesFor: unused,
    siteDrafts: unused,
    createDraft: unused,
    renameDraft: unused,
    closeDraft: unused,
    draftPages: unused,
    openDraft: unused,
    applyBatch: unused,
    draftUpdate: unused,
    suggestMerge: unused,
    suggestAltText: unused,
    updateDraft: unused,
    draftSharing: unused,
    shareDraft: unused,
    submissionCheck: unused,
    submitDraft: unused,
    siteReleases: unused,
    rollBack: unused,
    restoreRelease: unused,
    brands: unused,
    brand: unused,
    saveBrandLook: unused,
    saveVoiceGuide: unused,
    blockCatalog: unused,
    siteBlocks: unused,
    adoptUpgrade: unused,
    upgradeEverywhere: unused,
    workflow: unused,
    saveWorkflow: unused,
    approvals: unused,
    review: unused,
    reviewPage: unused,
    decide: unused,
    previewPage: unused,
  });
  const server = rpcWebHandler(
    StudioRpcs,
    handlers.pipe(Layer.provideMerge(Layer.mergeAll(session, visitor))),
  );
  return { seen, binding: { fetch: (request: Request) => server.handler(request) } };
};

const browserRequest = (cookie: string | null, signal?: AbortSignal) => {
  const headers = new Headers();
  if (cookie !== null) headers.set("cookie", cookie);
  return new Request("https://studio.pakshi.test/", { headers, signal: signal ?? null });
};

const failureOf = (call: Promise<Viewer>) =>
  call.then(
    () => new Error("expected the call to fail"),
    (error: Error) => error,
  );

const unavailable = new AppRequestError(
  "unavailable",
  "The service is temporarily unavailable. Please try again.",
);

describe("a Studio call", () => {
  test("returns the contract's result, with the session and Studio's origin reaching studio-api", async () => {
    const api = fakeStudioApi("answer");
    const viewer = await callStudio(
      { binding: api.binding, request: browserRequest("session=sam") },
      (studio) => studio.viewer(),
    );
    expect(viewer.user).toEqual(sam);
    expect(viewer.sites.map((site) => site.name)).toEqual(["Harbour Summer School"]);
    expect(api.seen).toEqual(["https://studio.pakshi.test"]);
  });

  test("lets the caller treat a missing session as data", async () => {
    const viewer = await callStudio(
      { binding: fakeStudioApi("answer").binding, request: browserRequest(null) },
      (studio) =>
        studio.viewer().pipe(Effect.catchTag("Unauthenticated", () => Effect.succeed(null))),
    );
    expect(viewer).toBeNull();
  });
});

describe("a failed Studio call reaches the browser as a safe error", () => {
  const call = (behaviour: Behaviour, cookie = "session=sam") =>
    failureOf(
      callStudio(
        {
          binding: fakeStudioApi(behaviour).binding,
          request: browserRequest(cookie),
          timeout: "100 millis",
        },
        (studio) => studio.viewer(),
      ),
    );

  test("an expired session asks the person to sign in again", async () => {
    expect(await call("answer", "session=expired")).toEqual(
      new AppRequestError("unauthenticated", "Your session has ended. Sign in again."),
    );
  });

  test("studio-api's storage being down is retryable", async () => {
    expect(await call("unavailable")).toEqual(unavailable);
  });

  test("a bug in studio-api reveals nothing about it", async () => {
    expect(await call("defect")).toEqual(
      new AppRequestError("internal", "The request could not be completed."),
    );
  });

  test("no answer within the timeout is retryable", async () => {
    expect(await call("hang")).toEqual(unavailable);
  });

  test("an unreachable studio-api is retryable and reveals nothing", async () => {
    const binding = { fetch: () => Promise.reject(new Error("private.internal: refused")) };
    expect(
      await failureOf(
        callStudio({ binding, request: browserRequest("session=sam") }, (studio) =>
          studio.viewer(),
        ),
      ),
    ).toEqual(unavailable);
  });
});

test("cancelling the browser request stops the call without an application error", async () => {
  const controller = new AbortController();
  const call = failureOf(
    callStudio(
      {
        binding: fakeStudioApi("hang").binding,
        request: browserRequest("session=sam", controller.signal),
      },
      (studio) => studio.viewer(),
    ),
  );
  controller.abort();
  expect(await call).not.toBeInstanceOf(AppRequestError);
});
