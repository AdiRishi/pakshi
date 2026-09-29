import type { Draft } from "@repo/contracts/draft";
import { BatchId, type BlockId, type PageId, randomId } from "@repo/contracts/ids";
import type { Batch, BatchError, Op, PropPath, Target } from "@repo/contracts/ops";
import type { BatchOutcome } from "@repo/contracts/studio";
import { applyOps, type BlockContracts } from "@repo/domain/document";

/**
 * How the editor reaches the site's draft. `send` resolves with what became
 * of a batch. It rejects when the batch may not have arrived, and the store
 * sends it again with the same ID, which SiteDoc applies at most once.
 */
export interface Connection {
  readonly send: (batch: Batch) => Promise<BatchOutcome>;
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

/** Something the editor tells the person, such as a change SiteDoc refused. */
export interface Notice {
  readonly message: string;
  readonly errors: ReadonlyArray<BatchError>;
}

export type SaveStatus = "saved" | "saving" | "retrying";

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
}

interface Pending {
  readonly batch: Batch;
  /** Set while typing can still extend this batch, before it's sent. */
  readonly burst: string | null;
}

/** One step of undo: the ops that reverse a command, and the ops that redo it. */
interface Step {
  readonly undo: ReadonlyArray<Op>;
  readonly redo: ReadonlyArray<Op>;
}

/** How long typing waits before sending, so others see text within half a second. */
const typingDelay = 300;
const retryDelays = [500, 1000, 2000, 5000, 10_000];

const newBatchId = () => BatchId.make(randomId("bat"));

const blockExists = (draft: Draft, target: Target, block: BlockId) =>
  target === "site"
    ? block in draft.parts.blocks
    : draft.pages[target]?.blocks[block] !== undefined;

/**
 * The editor's local copy of the draft. A command applies at once through
 * the same document module SiteDoc runs, and its batch goes to SiteDoc in the
 * background, one at a time. Typing in one field is one burst: its keystrokes
 * share one undo step, and share a batch until that batch is sent.
 */
export class EditorStore {
  readonly contracts: BlockContracts;
  readonly #connection: Connection;
  readonly #onNotice: (notice: Notice) => void;
  readonly #listeners = new Set<() => void>();
  #state: EditorState;
  #pending: ReadonlyArray<Pending> = [];
  #sending = false;
  #retrying = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #undo: Array<Step> = [];
  #redo: Array<Step> = [];
  /** The field being typed in, whose undo step is still growing. */
  #burst: string | null = null;

  constructor(options: {
    readonly draft: Draft;
    readonly page: PageId;
    readonly contracts: BlockContracts;
    readonly connection: Connection;
    readonly onNotice: (notice: Notice) => void;
  }) {
    this.contracts = options.contracts;
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
    };
  }

  getState = () => this.#state;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(next: Partial<Omit<EditorState, "status">>) {
    const merged = { ...this.#state, ...next };
    const selection = merged.selection;
    this.#state = {
      ...merged,
      selection:
        selection !== null && !blockExists(merged.view, selection.target, selection.block)
          ? null
          : selection,
      // Typing waiting to be sent counts as saving, so "saved" means SiteDoc has everything.
      status: this.#retrying ? "retrying" : this.#pending.length > 0 ? "saving" : "saved",
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
    };
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
    this.#queue(ops, burst);
    this.#set({ view: result.draft });
    return [];
  }

  /** Ends the current burst of typing, so the next keystroke starts a new undo step. */
  endBurst() {
    this.#burst = null;
    this.#pending = this.#pending.map((pending) => ({ ...pending, burst: null }));
    this.#flush();
  }

  /**
   * Reverts the current burst of typing, as Escape does in a text field: its
   * field goes back to the value it had before the burst, and its undo step
   * goes away.
   */
  cancelBurst() {
    if (this.#burst === null) return;
    this.#burst = null;
    const step = this.#undo.pop();
    if (step === undefined) return;
    const result = applyOps(this.#state.view, step.undo, this.contracts);
    if (!result.ok) return;
    this.#queue(step.undo, null);
    this.#set({ view: result.draft });
  }

  undo() {
    this.#step(this.#undo, this.#redo, "undo");
  }

  redo() {
    this.#step(this.#redo, this.#undo, "redo");
  }

  #step(from: Array<Step>, to: Array<Step>, direction: "undo" | "redo") {
    this.endBurst();
    const step = from.pop();
    if (step === undefined) return;
    const ops = direction === "undo" ? step.undo : step.redo;
    const result = applyOps(this.#state.view, ops, this.contracts);
    if (!result.ok) {
      this.#onNotice({
        message: `That change can't be ${direction === "undo" ? "undone" : "redone"} any more.`,
        errors: result.errors,
      });
      this.#set({});
      return;
    }
    to.push(step);
    this.#queue(ops, null);
    this.#set({ view: result.draft });
  }

  #queue(ops: ReadonlyArray<Op>, burst: string | null) {
    const last = this.#pending.at(-1);
    if (burst !== null && last !== undefined && last.burst === burst)
      // Only the latest value of the field needs to reach SiteDoc.
      this.#pending = [...this.#pending.slice(0, -1), { ...last, batch: { ...last.batch, ops } }];
    else this.#pending = [...this.#pending, { batch: { id: newBatchId(), ops }, burst }];
    clearTimeout(this.#timer);
    if (burst === null) this.#flush();
    else this.#timer = setTimeout(() => this.endBurstBatch(), typingDelay);
  }

  /** Closes the batch typing is extending, so it can be sent; the undo step keeps growing. */
  endBurstBatch() {
    this.#pending = this.#pending.map((pending) => ({ ...pending, burst: null }));
    this.#flush();
  }

  #flush() {
    if (this.#sending) return;
    const next = this.#pending[0];
    if (next === undefined || next.burst !== null) return;
    this.#sending = true;
    this.#send(next.batch, 0);
  }

  #send(batch: Batch, attempt: number) {
    this.#connection.send(batch).then(
      (outcome) => {
        this.#sending = false;
        this.#retrying = false;
        this.#settle(batch, outcome);
        this.#flush();
      },
      () => {
        this.#retrying = true;
        this.#set({});
        const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
        setTimeout(() => this.#send(batch, attempt + 1), delay);
      },
    );
  }

  /** Moves a batch SiteDoc has answered out of the pending list, and replays the rest. */
  #settle(batch: Batch, outcome: BatchOutcome) {
    this.#pending = this.#pending.filter((pending) => pending.batch.id !== batch.id);
    let confirmed = this.#state.confirmed;
    if (outcome.status === "committed") {
      const applied = applyOps(confirmed, batch.ops, this.contracts);
      if (!applied.ok) throw new Error("SiteDoc committed a batch the document module rejects.");
      confirmed = { ...applied.draft, revision: outcome.revision };
    } else {
      this.#onNotice({
        message: "A change couldn't be saved, so it was undone.",
        errors: outcome.errors,
      });
    }
    let view = confirmed;
    const kept: Array<Pending> = [];
    for (const pending of this.#pending) {
      const replayed = applyOps(view, pending.batch.ops, this.contracts);
      if (replayed.ok) {
        view = replayed.draft;
        kept.push(pending);
      } else {
        this.#onNotice({
          message: "A change no longer applies, so it was dropped.",
          errors: replayed.errors,
        });
      }
    }
    this.#pending = kept;
    this.#set({ confirmed, view });
  }
}
