import type { Draft } from "@repo/contracts/draft";
import { BatchId, type BlockId, type PageId, randomId } from "@repo/contracts/ids";
import {
  CatchUp,
  type ClientMessage,
  type Collaborator,
  type Commit,
  type CommittedBatch,
  type Peer,
  type Presence,
  ServerMessage,
} from "@repo/contracts/live";
import type { Batch, BatchError, Op, PropPath, Target } from "@repo/contracts/ops";
import type { LiveRelease } from "@repo/contracts/snapshot";
import { applyEach, applyOps, type BlockContracts } from "@repo/domain/document";
import { Equal } from "effect";

import { describeErrors, type Notice, partChanged } from "./notices.ts";

/** What the editor's side of a live connection can do once it's open. */
export interface LiveLink {
  readonly send: (message: ClientMessage) => void;
  /** Closes the connection for good. */
  readonly close: () => void;
}

/**
 * How the editor reaches the site's SiteDoc. `open` connects, and reconnects
 * after every drop until the link is closed. `onOpen` runs each time a
 * connection opens, and `onClose` each time one drops.
 */
export interface Connection {
  readonly open: (events: {
    readonly onOpen: () => void;
    readonly onMessage: (message: ServerMessage) => void;
    readonly onClose: () => void;
  }) => LiveLink;
}

/** What the person has selected: a block, or one field of it. */
export type Selection =
  | { readonly kind: "block"; readonly target: Target; readonly block: BlockId }
  | {
      readonly kind: "field";
      readonly target: Target;
      readonly block: BlockId;
      readonly path: PropPath;
    };

/**
 * Whether SiteDoc has everything the person has done. `offline` means the
 * connection dropped and the editor is reconnecting; edits made meanwhile are
 * sent once it's back.
 */
export type SaveStatus = "saved" | "saving" | "offline";

export interface EditorState {
  /** The draft as SiteDoc last confirmed it. */
  readonly confirmed: Draft;
  /** What the person sees: their unconfirmed batches replayed over the confirmed draft. */
  readonly view: Draft;
  readonly page: PageId;
  readonly selection: Selection | null;
  readonly status: SaveStatus;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Everyone else connected to the draft. */
  readonly peers: ReadonlyArray<Peer>;
  /** The release the site serves. The draft is behind when it started from another. */
  readonly live: LiveRelease;
  /** Who published or closed the draft, once someone has; it takes no more changes. */
  readonly closed: DraftClosure | null;
  /**
   * Whether a merge moved the draft to other block versions, which this
   * editor didn't load, so it must open the draft again.
   */
  readonly outdated: boolean;
}

/** How a draft stopped taking changes: who published or closed it, and the release it became. */
export type DraftClosure = Omit<Extract<ServerMessage, { _tag: "DraftClosed" }>, "_tag">;

interface Pending {
  readonly batch: Batch;
  /** Set while typing can still extend this batch, before it's sent. */
  readonly burst: string | null;
  /** Whether it went out on the current connection. */
  readonly sent: boolean;
}

/** One step of undo: the ops that reverse a command, and the ops that redo it. */
interface Step {
  readonly undo: ReadonlyArray<Op>;
  readonly redo: ReadonlyArray<Op>;
}

/** How long typing waits before sending, so others see text within half a second. */
const typingDelay = 300;
/** How long after the last keystroke others still see the person as typing. */
const typingShown = 2000;

const newBatchId = () => BatchId.make(randomId("bat"));

const replacedNotice = (name: string, parts: ReadonlyArray<string>): Notice => ({
  title: `${name} replaced your change.`,
  description: `They changed ${Array.from(new Set(parts)).join(", ")} after you.`,
});

/** The key typing in one field shares, so a burst of keystrokes is one undo step. */
export const fieldKey = (target: Target, block: BlockId, path: PropPath) =>
  `${target}:${block}:${path.join(".")}`;

/** The value an op sets, as a key, or null for ops that change a page's structure. */
const valueKey = (op: Op) => {
  switch (op.op) {
    case "setProp":
      return fieldKey(op.target, op.block, op.path);
    case "setVariant":
    case "setSurface":
      return `${op.target}:${op.block}:${op.op}`;
    case "setMeta":
      return `${op.page}:meta:${op.field}`;
    case "setPath":
      return `${op.page}:path`;
    default:
      return null;
  }
};

/** Whether two value keys name the same value, or one names a part of the other. */
const overlaps = (a: string, b: string) =>
  a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

const blockExists = (draft: Draft, target: Target, block: BlockId) =>
  target === "site"
    ? block in draft.parts.blocks
    : draft.pages[target]?.blocks[block] !== undefined;

/**
 * The editor's local copy of the draft. A command applies at once through
 * the same document module SiteDoc runs, and its batch goes to SiteDoc over
 * the live connection. SiteDoc sends every batch it commits to everyone, so
 * the editor keeps the confirmed draft in step with SiteDoc's, recognises its
 * own batches by their IDs, and shows its unconfirmed batches replayed over
 * the confirmed draft. Typing in one field is one burst: its keystrokes share
 * one undo step, and share a batch until that batch is sent.
 */
export class EditorStore {
  readonly contracts: BlockContracts;
  readonly person: Collaborator;
  readonly #connection: Connection;
  readonly #onNotice: (notice: Notice) => void;
  readonly #listeners = new Set<() => void>();
  readonly #beforeRemote = new Set<() => void>();
  #state: EditorState;
  #pending: ReadonlyArray<Pending> = [];
  #undo: Array<Step> = [];
  #redo: Array<Step> = [];
  /**
   * The values the person has written since opening the editor. They're told
   * when someone replaces one of these, not about writes from earlier visits.
   */
  readonly #wrote = new Set<string>();
  /** The field being typed in, whose undo step is still growing. */
  #burst: string | null = null;
  /** The values the current burst of typing writes, by `valueKey`. */
  #burstValues = new Set<string>();
  /** Someone replaced what the person is typing: told when the typing stops, unless they type over it. */
  #replacedWhileTyping: { readonly key: string; readonly notice: Notice } | null = null;
  #burstTimer: ReturnType<typeof setTimeout> | undefined;
  #typing = false;
  #typingTimer: ReturnType<typeof setTimeout> | undefined;
  #link: LiveLink | null = null;
  #socket: "connecting" | "open" | "closed" = "connecting";
  /** Whether SiteDoc has answered this connection's Sync, so batches can go out. */
  #synced = false;
  /** The presence last sent, so an unchanged one isn't sent again. */
  #published: string | null = null;

  constructor(options: {
    readonly draft: Draft;
    readonly live: LiveRelease;
    readonly page: PageId;
    readonly contracts: BlockContracts;
    readonly person: Collaborator;
    readonly connection: Connection;
    readonly onNotice: (notice: Notice) => void;
  }) {
    this.contracts = options.contracts;
    this.person = options.person;
    this.#connection = options.connection;
    this.#onNotice = options.onNotice;
    this.#state = {
      confirmed: options.draft,
      view: options.draft,
      page: options.page,
      selection: null,
      status: "saved",
      canUndo: false,
      canRedo: false,
      peers: [],
      live: options.live,
      closed: null,
      outdated: false,
    };
  }

  getState = () => this.#state;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Runs a listener just before someone else's change reaches what the
   * person sees, such as to note what's on screen so the view can stay put.
   */
  beforeRemoteChange = (listener: () => void) => {
    this.#beforeRemote.add(listener);
    return () => {
      this.#beforeRemote.delete(listener);
    };
  };

  #showRemote(next: Partial<Omit<EditorState, "status" | "canUndo" | "canRedo">>) {
    // Listeners note what's on screen for the render that follows, so only a new view warrants it.
    if (next.view !== undefined && next.view !== this.#state.view)
      for (const listener of this.#beforeRemote) listener();
    this.#set(next);
  }

  /** Connects to SiteDoc, and returns what disconnects. */
  connect = () => {
    const link = this.#connection.open({
      onOpen: () => this.#opened(),
      onMessage: (message) => this.#received(message),
      onClose: () => this.#closed(),
    });
    this.#link = link;
    return () => {
      link.close();
      if (this.#link === link) this.#link = null;
      clearTimeout(this.#burstTimer);
      clearTimeout(this.#typingTimer);
    };
  };

  #set(next: Partial<Omit<EditorState, "status" | "canUndo" | "canRedo">>) {
    const merged = { ...this.#state, ...next };
    const selection = merged.selection;
    this.#state = {
      ...merged,
      selection:
        selection !== null && !blockExists(merged.view, selection.target, selection.block)
          ? null
          : selection,
      // Typing waiting to be sent counts as saving, so "saved" means SiteDoc has everything.
      status: this.#socket === "closed" ? "offline" : this.#pending.length > 0 ? "saving" : "saved",
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
    };
    this.#publish();
    for (const listener of this.#listeners) listener();
  }

  select(selection: Selection | null) {
    this.#set({ selection });
  }

  /**
   * Applies a command's ops, or returns why they can't apply. Ops sharing a
   * `burst` key with the command before, such as keystrokes in one field,
   * join its undo step.
   */
  run(ops: ReadonlyArray<Op>, burst: string | null = null): ReadonlyArray<BatchError> {
    const result = applyOps(this.#state.view, ops, this.contracts);
    if (!result.ok) return result.errors;
    const extending = burst !== null && burst === this.#burst;
    const last = this.#undo.at(-1);
    if (extending && last !== undefined) this.#undo[this.#undo.length - 1] = { ...last, redo: ops };
    else this.#undo.push({ undo: result.inverse, redo: ops });
    if (burst !== this.#burst) this.#burstValues = new Set();
    this.#burst = burst;
    const written = ops.flatMap((op) => valueKey(op) ?? []);
    if (burst !== null) for (const key of written) this.#burstValues.add(key);
    const typingOver = this.#replacedWhileTyping;
    if (typingOver !== null && written.some((key) => overlaps(key, typingOver.key)))
      this.#replacedWhileTyping = null;
    this.#redo = [];
    if (burst !== null) this.#typed();
    this.#queue({ id: newBatchId(), ops }, burst);
    this.#set({ view: result.draft });
    return [];
  }

  /** Ends the current burst of typing, so the next keystroke starts a new undo step. */
  endBurst() {
    this.#burst = null;
    this.#burstValues = new Set();
    this.#stopTyping();
    this.#tellReplacedWhileTyping();
    this.endBurstBatch();
  }

  /**
   * Reverts the current burst of typing, as Escape does in a text field: its
   * field goes back to the value it had before the burst, and its undo step
   * goes away.
   */
  cancelBurst() {
    if (this.#burst === null) return;
    this.#burst = null;
    this.#burstValues = new Set();
    this.#stopTyping();
    this.#tellReplacedWhileTyping();
    this.#pending = this.#pending.map((pending) => ({ ...pending, burst: null }));
    const step = this.#undo.pop();
    if (step === undefined) return;
    const result = applyEach(this.#state.view, step.undo, this.contracts, () => true);
    this.#queue({ id: newBatchId(), ops: step.undo, undo: true }, null);
    this.#set({ view: result.draft });
  }

  #tellReplacedWhileTyping() {
    const replaced = this.#replacedWhileTyping;
    this.#replacedWhileTyping = null;
    if (replaced !== null) this.#onNotice(replaced.notice);
  }

  undo() {
    this.#step(this.#undo, this.#redo, "undo");
  }

  redo() {
    this.#step(this.#redo, this.#undo, "redo");
  }

  /**
   * Undo and redo each reverse the person's own writes, so their batches are
   * marked as undo: SiteDoc passes over any part someone else has changed since.
   */
  #step(from: Array<Step>, to: Array<Step>, direction: "undo" | "redo") {
    this.endBurst();
    const step = from.pop();
    if (step === undefined) return;
    const ops = direction === "undo" ? step.undo : step.redo;
    const result = applyEach(this.#state.view, ops, this.contracts, () => true);
    if (result.steps.length === 0) {
      this.#onNotice({
        title: `That change can't be ${direction === "undo" ? "undone" : "redone"} any more.`,
        description: "What it changed is no longer on the page.",
      });
      this.#set({});
      return;
    }
    to.push(step);
    this.#queue({ id: newBatchId(), ops, undo: true }, null);
    this.#set({ view: result.draft });
  }

  #queue(batch: Batch, burst: string | null) {
    for (const op of batch.ops) {
      const key = valueKey(op);
      if (key !== null) this.#wrote.add(key);
    }
    const last = this.#pending.at(-1);
    if (burst !== null && last !== undefined && last.burst === burst)
      // Only the latest value of the field needs to reach SiteDoc.
      this.#pending = [
        ...this.#pending.slice(0, -1),
        { ...last, batch: { ...last.batch, ops: batch.ops } },
      ];
    else this.#pending = [...this.#pending, { batch, burst, sent: false }];
    clearTimeout(this.#burstTimer);
    if (burst === null) this.#flush();
    else this.#burstTimer = setTimeout(() => this.endBurstBatch(), typingDelay);
  }

  /** Closes the batch typing is extending, so it can be sent; the undo step keeps growing. */
  endBurstBatch() {
    clearTimeout(this.#burstTimer);
    this.#pending = this.#pending.map((pending) => ({ ...pending, burst: null }));
    this.#flush();
  }

  /**
   * Sends, in order, the batches that haven't gone out on this connection, up
   * to one that typing can still extend.
   */
  #flush() {
    if (this.#link === null || this.#socket !== "open" || !this.#synced) return;
    const link = this.#link;
    const open = this.#pending.findIndex((pending) => pending.burst !== null);
    const ready = open === -1 ? this.#pending.length : open;
    this.#pending = this.#pending.map((pending, index) => {
      if (pending.sent || index >= ready) return pending;
      link.send({ _tag: "Batch", batch: pending.batch });
      return { ...pending, sent: true };
    });
  }

  // Presence ----------------------------------------------------------------

  #typed() {
    this.#typing = true;
    clearTimeout(this.#typingTimer);
    this.#typingTimer = setTimeout(() => this.#stopTyping(), typingShown);
  }

  #stopTyping() {
    clearTimeout(this.#typingTimer);
    if (!this.#typing) return;
    this.#typing = false;
    this.#publish();
  }

  #presence(): Presence {
    const { page, selection } = this.#state;
    return {
      page,
      focus:
        selection === null
          ? null
          : selection.kind === "block"
            ? { target: selection.target, block: selection.block }
            : { target: selection.target, block: selection.block, path: selection.path },
      typing: this.#typing && selection?.kind === "field",
    };
  }

  #publish() {
    if (this.#link === null || this.#socket !== "open" || !this.#synced) return;
    const presence = this.#presence();
    const encoded = JSON.stringify(presence);
    if (encoded === this.#published) return;
    this.#published = encoded;
    this.#link.send({ _tag: "Presence", presence });
  }

  // The connection ------------------------------------------------------------

  #opened() {
    this.#socket = "open";
    this.#synced = false;
    this.#published = null;
    // Nothing sent on an earlier connection is known to have arrived.
    this.#pending = this.#pending.map((pending) => ({ ...pending, sent: false }));
    this.#link?.send({ _tag: "Sync", revision: this.#state.confirmed.revision });
    this.#set({});
  }

  #closed() {
    this.#socket = "closed";
    this.#synced = false;
    this.#set({ peers: [] });
  }

  /**
   * Stops for good once a merge moved the draft to block versions this
   * editor didn't load: nothing more is applied with the old versions, and
   * nothing more is sent, until the person opens the draft again.
   */
  #outdate() {
    this.#link?.close();
    this.#link = null;
    this.#set({ outdated: true });
  }

  #received(message: ServerMessage) {
    if (this.#state.outdated) return;
    ServerMessage.match(message, {
      Synced: ({ catchUp, peers }) => {
        const confirmed = CatchUp.match(catchUp, {
          Batches: ({ batches }) =>
            batches.reduce((draft, batch) => this.#confirm(draft, batch), this.#state.confirmed),
          Draft: ({ draft }) => {
            if (!Equal.equals(draft.lockfile, this.#state.confirmed.lockfile)) this.#outdate();
            return draft;
          },
        });
        if (this.#state.outdated) return;
        this.#synced = true;
        this.#showRemote({ confirmed, view: this.#replay(confirmed).view, peers });
        this.#flush();
      },
      Committed: (commit) => this.#committed(commit),
      Known: ({ batch }) => {
        this.#pending = this.#pending.filter((pending) => pending.batch.id !== batch);
        this.#rebase(this.#state.confirmed);
      },
      Rejected: ({ batch, errors }) => {
        if (!this.#pending.some((pending) => pending.batch.id === batch)) return;
        this.#pending = this.#pending.filter((pending) => pending.batch.id !== batch);
        this.#onNotice({
          title: "A change couldn't be saved, so it was undone.",
          description: describeErrors(errors),
        });
        this.#rebase(this.#state.confirmed);
      },
      PeerChanged: ({ peer }) =>
        this.#set({
          peers: [
            ...this.#state.peers.filter((other) => other.connection !== peer.connection),
            peer,
          ],
        }),
      PeerLeft: ({ connection }) =>
        this.#set({ peers: this.#state.peers.filter((peer) => peer.connection !== connection) }),
      LiveChanged: ({ live }) => this.#set({ live }),
      DraftClosed: ({ by, release }) => this.#set({ closed: { by, release } }),
    });
  }

  /** The confirmed draft after a committed batch, and this person's batch taken out of the pending ones. */
  #confirm(draft: Draft, batch: CommittedBatch) {
    if (this.#state.outdated || batch.revision <= draft.revision) return draft;
    const rebase = batch.ops.findLast((op) => op.op === "rebase");
    if (rebase !== undefined && !Equal.equals(rebase.lockfile, draft.lockfile)) {
      this.#outdate();
      return draft;
    }
    const applied = applyOps(draft, batch.ops, this.contracts);
    if (!applied.ok) throw new Error("SiteDoc committed a batch the document module rejects.");
    this.#pending = this.#pending.filter((pending) => pending.batch.id !== batch.id);
    return { ...applied.draft, revision: batch.revision };
  }

  #committed({ batch, skipped, replaced }: Commit) {
    const confirmed = this.#state.confirmed;
    if (batch.revision <= confirmed.revision) return;
    if (batch.revision > confirmed.revision + 1) {
      // A batch went missing, so SiteDoc sends what this editor lacks.
      this.#synced = false;
      this.#link?.send({ _tag: "Sync", revision: confirmed.revision });
      return;
    }
    const mine = this.#pending.some((pending) => pending.batch.id === batch.id);
    const next = this.#confirm(confirmed, batch);
    if (this.#state.outdated) return;
    if (mine && skipped.length > 0)
      this.#onNotice({
        title: "Some of that couldn't be undone.",
        description: "Someone else changed it since, so their change stays.",
      });
    const parts: Array<string> = [];
    for (const { person, op: index } of replaced) {
      const op = batch.ops[index];
      if (person !== this.person.id || op === undefined || !this.#wroteHere(op)) continue;
      if (this.#willReplace(op)) continue;
      const part = partChanged(op, confirmed, this.contracts);
      const key = valueKey(op);
      if (key !== null && Array.from(this.#burstValues).some((typed) => overlaps(typed, key)))
        // They're still typing there: they're told when they stop, unless they type over it.
        this.#replacedWhileTyping = { key, notice: replacedNotice(batch.actor.name, [part]) };
      else parts.push(part);
    }
    if (parts.length > 0) this.#onNotice(replacedNotice(batch.actor.name, parts));
    const { view, dropped } = this.#replay(next, batch.actor.name);
    const selection = this.#state.selection;
    // A dropped edit already says who removed the block.
    if (!dropped && selection !== null && !blockExists(view, selection.target, selection.block))
      this.#onNotice({ title: `${batch.actor.name} removed the block you had selected.` });
    if (mine) this.#set({ confirmed: next, view });
    else this.#showRemote({ confirmed: next, view });
  }

  #wroteHere(op: Op) {
    const key = valueKey(op);
    return key !== null && Array.from(this.#wrote).some((written) => overlaps(written, key));
  }

  /** Whether a batch of the person's that SiteDoc hasn't confirmed writes the same value, so it will win. */
  #willReplace(op: Op) {
    const key = valueKey(op);
    return (
      key !== null &&
      this.#pending.some(({ batch }) =>
        batch.ops.some((pending) => {
          const pendingKey = valueKey(pending);
          return pendingKey !== null && overlaps(pendingKey, key);
        }),
      )
    );
  }

  /**
   * The pending batches replayed over a confirmed draft. Any that no longer
   * apply are dropped, and the person told; `by` names whoever's change
   * caused it, when that's known.
   */
  #replay(confirmed: Draft, by?: string) {
    let view = confirmed;
    let dropped = false;
    const kept: Array<Pending> = [];
    for (const pending of this.#pending) {
      if (pending.batch.undo === true) {
        view = applyEach(view, pending.batch.ops, this.contracts, () => true).draft;
        kept.push(pending);
        continue;
      }
      const replayed = applyOps(view, pending.batch.ops, this.contracts);
      if (replayed.ok) {
        view = replayed.draft;
        kept.push(pending);
        continue;
      }
      dropped = true;
      const [first] = pending.batch.ops;
      // Described as the person last saw it, since the part may be gone now.
      const part =
        first === undefined ? "the page" : partChanged(first, this.#state.view, this.contracts);
      this.#onNotice({
        title: `Your change to ${part} was dropped.`,
        description: replayed.errors.some((error) => error.rule === "unknown-block")
          ? `${by ?? "Someone"} removed what it changed.`
          : `${by ?? "Someone"} changed the page first, so it no longer fits. ${describeErrors(replayed.errors)}`,
      });
    }
    this.#pending = kept;
    return { view, dropped };
  }

  #rebase(confirmed: Draft) {
    this.#set({ confirmed, view: this.#replay(confirmed).view });
  }
}
