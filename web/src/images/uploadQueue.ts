/**
 * The upload queue's scheduler, free of React and the DOM so it is tested
 * directly (#105).
 *
 * Up to a hundred photos can be dropped at once, on a phone. Shrinking is the
 * memory-hungry step, so one runs at a time; uploads are the slow step, so two
 * overlap. A card that has been shrunk keeps the shrink slot until an upload slot
 * frees, which stops decoded work piling up behind a slow connection. One
 * failure settles that card and nothing else.
 */

import { ApiError } from "../api/http";
import { nameFromFile } from "./photoName";
import { ShrinkError } from "./shrink";

export type CardState = "waiting" | "shrinking" | "uploading" | "done" | "duplicate" | "failed";

export type FailureReason =
  | "unreadable"
  | "unsupported"
  | "too_large"
  | "blank"
  | "image_library_full"
  | "image_storage_full"
  | "network"
  | "rejected";

export type Card = {
  id: string;
  file: File;
  state: CardState;
  reason?: FailureReason;
  imageId?: number;
};

/** Every size of one photo, largest first, as shrink() makes them and one upload sends them. */
export type Sizes = Blob[];

/** Sends one photo: every size of it, and the name it goes into the library under. */
export type UploadFn = (sizes: Sizes, name: string) => Promise<{ status: 200 | 201; id: number }>;
export type ShrinkFn = (file: File) => Promise<Sizes>;

export const MAX_SHRINKING = 1;
export const MAX_UPLOADING = 2;
/** Used when a 429 carries no `Retry-After`. */
export const DEFAULT_RETRY_AFTER_SECONDS = 5;
/** The wait is clamped: a proxy sending 0 would spin, and one sending an hour would strand the queue. */
export const MIN_RETRY_AFTER_SECONDS = 1;
export const MAX_RETRY_AFTER_SECONDS = 65;

type Options = {
  upload: UploadFn;
  shrinker: ShrinkFn;
  /**
   * Called once when the queue goes idle after at least one card landed as
   * `done`, so a hundred photos cost one cache invalidation and not a hundred.
   */
  onSettled?: () => void;
  sleep?: (ms: number) => Promise<void>;
};

const SETTLED: CardState[] = ["done", "duplicate", "failed"];

export class UploadQueue {
  private cards: Card[] = [];
  private readonly sizes = new Map<string, Sizes>();
  private readonly listeners = new Set<() => void>();
  private nextId = 1;
  private disposed = false;
  private doneSinceIdle = false;
  /** Set while the server has told us to back off; no upload starts until it settles. */
  private pause: Promise<void> | null = null;

  constructor(private readonly options: Options) {}

  /** Stable between changes, so it works as a useSyncExternalStore snapshot. */
  getSnapshot = (): Card[] => this.cards;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Stops scheduling. Cards still waiting stay waiting and anything in flight
   * finishes, so leaving the page does not leave a half-written request behind.
   */
  dispose(): void {
    this.disposed = true;
  }

  /** Undoes dispose(). StrictMode runs an effect's cleanup and then its setup again. */
  activate(): void {
    if (!this.disposed) return;
    this.disposed = false;
    this.pump();
  }

  isBusy(cards: Card[] = this.cards): boolean {
    return cards.some((card) => !SETTLED.includes(card.state));
  }

  /** Queues the files and answers the ids of their cards, in the same order. */
  add(files: FileList | File[]): string[] {
    const added = Array.from(files).map((file): Card => ({
      id: `card-${this.nextId++}`,
      file,
      state: "waiting",
    }));
    if (added.length === 0) return [];
    this.cards = [...this.cards, ...added];
    this.emit();
    this.pump();
    return added.map((card) => card.id);
  }

  /**
   * The card once it has landed: done, duplicate or failed. A photo dropped on
   * a page slot waits on this to place the image the server answered with.
   */
  settled(id: string): Promise<Card> {
    return new Promise((resolve) => {
      const check = (): boolean => {
        const card = this.cards.find((c) => c.id === id);
        if (!card || !SETTLED.includes(card.state)) return false;
        resolve(card);
        return true;
      };
      if (check()) return;
      const unsubscribe = this.subscribe(() => {
        if (check()) unsubscribe();
      });
    });
  }

  retry(id: string): void {
    const card = this.cards.find((c) => c.id === id);
    if (!card || card.state !== "failed") return;
    this.update(id, { state: "waiting", reason: undefined });
    this.pump();
  }

  retryAllFailed(): void {
    const failed = this.cards.filter((c) => c.state === "failed");
    if (failed.length === 0) return;
    this.cards = this.cards.map((c) =>
      c.state === "failed" ? { ...c, state: "waiting", reason: undefined } : c,
    );
    this.emit();
    this.pump();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private update(id: string, patch: Partial<Card>): void {
    this.cards = this.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
    this.emit();
  }

  private count(state: CardState): number {
    return this.cards.filter((c) => c.state === state).length;
  }

  private pump(): void {
    if (this.disposed) return;

    // A shrunk card moves on first: it is already holding the shrink slot.
    for (const card of this.cards) {
      if (this.pause) break;
      if (this.count("uploading") >= MAX_UPLOADING) break;
      if (card.state === "shrinking" && this.sizes.has(card.id)) {
        this.update(card.id, { state: "uploading" });
        void this.runUpload(card.id);
      }
    }

    if (this.count("shrinking") < MAX_SHRINKING) {
      const next = this.cards.find((c) => c.state === "waiting");
      if (next) {
        this.update(next.id, { state: "shrinking" });
        void this.runShrink(next);
      }
    }

    if (this.doneSinceIdle && !this.isBusy()) {
      this.doneSinceIdle = false;
      // A failing invalidation must not reach back into the cards it reports on.
      try {
        this.options.onSettled?.();
      } catch {
        // Nothing to recover: the cards are already settled.
      }
    }
  }

  private async runShrink(card: Card): Promise<void> {
    try {
      this.sizes.set(card.id, await this.options.shrinker(card.file));
    } catch (error) {
      this.update(card.id, { state: "failed", reason: shrinkReason(error) });
    }
    this.pump();
  }

  private async runUpload(id: string): Promise<void> {
    const sizes = this.sizes.get(id);
    const card = this.cards.find((c) => c.id === id);
    if (!sizes || !card) return;
    try {
      const result = await this.uploadWithOneRetry(sizes, nameFromFile(card.file.name));
      this.update(id, {
        state: result.status === 201 ? "done" : "duplicate",
        imageId: result.id,
      });
      if (result.status === 201) this.doneSinceIdle = true;
    } catch (error) {
      this.update(id, { state: "failed", reason: uploadReason(error) });
    } finally {
      this.sizes.delete(id);
    }
    this.pump();
  }

  /**
   * The limit is per account, so a 429 on one upload means the other slot would
   * be refused too. The whole queue waits; a second 429 during the wait joins it.
   */
  private backOff(retryAfter: number | null): Promise<void> {
    if (!this.pause) {
      const seconds = Math.min(
        MAX_RETRY_AFTER_SECONDS,
        Math.max(MIN_RETRY_AFTER_SECONDS, retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS),
      );
      const sleep =
        this.options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
      this.pause = sleep(seconds * 1000).then(() => {
        this.pause = null;
        this.pump();
      });
    }
    return this.pause;
  }

  /** One wait-and-retry on 429, then the second refusal is the answer. */
  private async uploadWithOneRetry(sizes: Sizes, name: string): ReturnType<UploadFn> {
    try {
      return await this.options.upload(sizes, name);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429) throw error;
      await this.backOff(error.retryAfter);
      return await this.options.upload(sizes, name);
    }
  }
}

function shrinkReason(error: unknown): FailureReason {
  return error instanceof ShrinkError ? error.reason : "unreadable";
}

function uploadReason(error: unknown): FailureReason {
  if (!(error instanceof ApiError)) return "network";
  if (error.code === "image_library_full") return "image_library_full";
  if (error.code === "image_storage_full") return "image_storage_full";
  if (error.status === 429 || error.status >= 500) return "network";
  return "rejected";
}
