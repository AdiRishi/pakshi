import type { DraftId, MediaId, SnapshotId } from "@repo/contracts/ids";
import type { ServerMessage } from "@repo/contracts/live";
import type { PageDocument } from "@repo/contracts/page";
import type {
  ContentHash,
  LiveRelease,
  MediaFile,
  SnapshotManifest,
} from "@repo/contracts/snapshot";
import { Context, type Effect, type Option } from "effect";

import type { OutboxMessage } from "./outbox.ts";

/*
 * What a SiteDoc reaches outside its own storage. Each is a service, so the
 * Site service runs the same against Cloudflare's bindings and in tests.
 * A failure here is a defect: the call it's part of fails whole, and
 * nothing it would have recorded is.
 */

/** The site's snapshots in R2. Objects never change once written. */
export class Snapshots extends Context.Service<
  Snapshots,
  {
    readonly manifest: (snapshot: SnapshotId) => Effect.Effect<SnapshotManifest>;
    readonly page: (hash: ContentHash) => Effect.Effect<PageDocument>;
    readonly writePage: (hash: ContentHash, page: PageDocument) => Effect.Effect<void>;
    readonly writeManifest: (manifest: SnapshotManifest) => Effect.Effect<void>;
  }
>()("Pakshi/StudioApi/Snapshots") {}

/** The site's `site → release` entry in KV, which `sites` reads on every request. */
export class Routing extends Context.Service<
  Routing,
  {
    readonly read: Effect.Effect<Option.Option<LiveRelease>>;
    readonly write: (live: LiveRelease) => Effect.Effect<void>;
  }
>()("Pakshi/StudioApi/Routing") {}

/** The files of library images, from D1. An image missing from the library has none. */
export class MediaLibrary extends Context.Service<
  MediaLibrary,
  {
    readonly files: (ids: ReadonlyArray<MediaId>) => Effect.Effect<ReadonlyMap<MediaId, MediaFile>>;
  }
>()("Pakshi/StudioApi/MediaLibrary") {}

/**
 * Where outbox messages go: D1's copies of releases, submissions and shares,
 * and notification emails. Delivering a copy again changes nothing.
 */
export class OutboxDelivery extends Context.Service<
  OutboxDelivery,
  { readonly deliver: (message: OutboxMessage) => Effect.Effect<void> }
>()("Pakshi/StudioApi/OutboxDelivery") {}

/** Everyone connected to the site: those in one draft, or with `null`, everyone. */
export class LiveUpdates extends Context.Service<
  LiveUpdates,
  { readonly send: (draft: DraftId | null, message: ServerMessage) => Effect.Effect<void> }
>()("Pakshi/StudioApi/LiveUpdates") {}
