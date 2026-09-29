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
import { applyEach, applyOps, type BlockContracts } from "@repo/domain/document";

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
}

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

/** The key typing in one field shares, so a burst of keystrokes is one undo step. */
export const fieldKey = (target: Target, block: BlockId, path: PropPath) =>
  `${target}:${block}:${path.join(".")}`;

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
  #state: EditorState;
  #pending: ReadonlyArray<Pending> = [];
  #undo: Array<Step> = [];
  #redo: Array<Step> = [];
  /** The field being typed in, whose undo step is still growing. */
  #burst: string | null = null;
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
    };
  }

  getState = () => this.#state;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

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
    this.#burst = burst;
    this.#redo = [];
    if (burst !== null) this.#typed();
    this.#queue({ id: newBatchId(), ops }, burst);
    this.#set({ view: result.draft });
    return [];
  }

  /** Ends the current burst of typing, so the next keystroke starts a new undo step. */
  endBurst() {
    this.#burst = null;
    this.#stopTyping();
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
    this.#stopTyping();
    this.#pending = this.#pending.map((pending) => ({ ...pending, burst: null }));
    const step = this.#undo.pop();
    if (step === undefined) return;
    const result = applyEach(this.#state.view, step.undo, this.contracts, () => true);
    this.#queue({ id: newBatchId(), ops: step.undo, undo: true }, null);
    this.#set({ view: result.draft });
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

  #received(message: ServerMessage) {
    ServerMessage.match(message, {
      Synced: ({ catchUp, peers }) => {
        const confirmed = CatchUp.match(catchUp, {
          Batches: ({ batches }) =>
            batches.reduce((draft, batch) => this.#confirm(draft, batch), this.#state.confirmed),
          Draft: ({ draft }) => draft,
        });
        this.#synced = true;
        this.#set({ confirmed, view: this.#replay(confirmed), peers });
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
    });
  }

  /** The confirmed draft after a committed batch, and this person's batch taken out of the pending ones. */
  #confirm(draft: Draft, batch: CommittedBatch) {
    if (batch.revision <= draft.revision) return draft;
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
    if (mine && skipped.length > 0)
      this.#onNotice({
        title: "Some of that couldn't be undone.",
        description: "Someone else changed it since, so their change stays.",
      });
    const parts = replaced.flatMap(({ person, op: index }) => {
      const op = batch.ops[index];
      if (person !== this.person.id || op === undefined || this.#stillEditing(op)) return [];
      return [partChanged(op, confirmed, this.contracts)];
    });
    if (parts.length > 0)
      this.#onNotice({
        title: `${batch.actor.name} replaced your change.`,
        description: `They changed ${Array.from(new Set(parts)).join(", ")} after you.`,
      });
    const view = this.#replay(next);
    const selection = this.#state.selection;
    if (selection !== null && !blockExists(view, selection.target, selection.block))
      this.#onNotice({ title: `${batch.actor.name} removed the block you had selected.` });
    this.#set({ confirmed: next, view });
  }

  /**
   * Whether the person is still changing the part an op wrote, in a batch not
   * yet confirmed or a burst of typing, so their value will replace it again.
   */
  #stillEditing(op: Op) {
    if (op.op !== "setProp") return false;
    const key = fieldKey(op.target, op.block, op.path);
    return (
      this.#burst === key ||
      this.#pending.some(({ batch }) =>
        batch.ops.some(
          (pending) =>
            pending.op === "setProp" &&
            fieldKey(pending.target, pending.block, pending.path) === key,
        ),
      )
    );
  }

  /** The pending batches replayed over a confirmed draft. Any that no longer apply are dropped. */
  #replay(confirmed: Draft) {
    let view = confirmed;
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
      const [first] = pending.batch.ops;
      // Described as the person last saw it, since the part may be gone now.
      const part =
        first === undefined ? "the page" : partChanged(first, this.#state.view, this.contracts);
      this.#onNotice({
        title: `Your change to ${part} was dropped.`,
        description: replayed.errors.some((error) => error.rule === "unknown-block")
          ? "Someone removed what it changed."
          : `Someone changed the page first, so it no longer fits. ${describeErrors(replayed.errors)}`,
      });
    }
    this.#pending = kept;
    return view;
  }

  #rebase(confirmed: Draft) {
    this.#set({ confirmed, view: this.#replay(confirmed) });
  }
}
