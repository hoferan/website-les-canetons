/**
 * The upload queue, free of React and the DOM so it is tested directly.
 *
 * Up to a hundred photos can be dropped at once, on a phone. Shrinking is the
 * memory-hungry step, so one runs at a time; uploads are the slow step, so two
 * overlap. A card that has been shrunk keeps the shrink slot until an upload slot
 * frees, which stops decoded work piling up behind a slow connection. One
 * failure settles that card and nothing else.
 *
 * p-queue does the scheduling, one queue per step. What a card is, how it
 * moves between states and why it failed are ours.
 */

import PQueue from "p-queue";

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
  private readonly listeners = new Set<() => void>();
  private nextId = 1;
  private disposed = false;
  private doneSinceIdle = false;
  private readonly shrinks = new PQueue({ concurrency: MAX_SHRINKING });
  private readonly uploads = new PQueue({ concurrency: MAX_UPLOADING });
  /** Set while the server has told us to back off; the uploads stay paused until it settles. */
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
    this.shrinks.pause();
    this.uploads.pause();
  }

  /** Undoes dispose(). StrictMode runs an effect's cleanup and then its setup again. */
  activate(): void {
    if (!this.disposed) return;
    this.disposed = false;
    this.shrinks.start();
    if (!this.pause) this.uploads.start();
    this.reportIfSettled();
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
    added.forEach((card) => this.enqueue(card));
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
    this.enqueue(card);
  }

  retryAllFailed(): void {
    const failed = this.cards.filter((c) => c.state === "failed");
    if (failed.length === 0) return;
    this.cards = this.cards.map((c) =>
      c.state === "failed" ? { ...c, state: "waiting", reason: undefined } : c,
    );
    this.emit();
    failed.forEach((card) => this.enqueue(card));
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private update(id: string, patch: Partial<Card>): void {
    this.cards = this.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
    this.emit();
  }

  /** Settles a card, then reports if that was the last one of the burst. */
  private land(id: string, patch: Partial<Card>): void {
    this.update(id, patch);
    this.reportIfSettled();
  }

  private reportIfSettled(): void {
    if (this.disposed || !this.doneSinceIdle || this.isBusy()) return;
    this.doneSinceIdle = false;
    // A failing invalidation must not reach back into the cards it reports on.
    try {
      this.options.onSettled?.();
    } catch {
      // Nothing to recover: the cards are already settled.
    }
  }

  /**
   * Cards are shrunk in the order they appear, so a retried card goes ahead of
   * the ones queued after it, as it would in a list read from the top.
   */
  private enqueue(card: Card): void {
    const position = this.cards.findIndex((c) => c.id === card.id);
    void this.shrinks.add(() => this.run(card), { priority: -position });
  }

  /** One card's whole way through: shrink, then hand the sizes to an upload slot. */
  private async run(card: Card): Promise<void> {
    this.update(card.id, { state: "shrinking" });
    let sizes: Sizes;
    try {
      sizes = await this.options.shrinker(card.file);
    } catch (error) {
      this.land(card.id, { state: "failed", reason: shrinkReason(error) });
      return;
    }
    // Waits until an upload slot takes the sizes. The card keeps the shrink slot until then.
    await new Promise<void>((started) => {
      void this.uploads.add(() => {
        started();
        return this.runUpload(card, sizes);
      });
    });
  }

  private async runUpload(card: Card, sizes: Sizes): Promise<void> {
    this.update(card.id, { state: "uploading" });
    try {
      const result = await this.uploadWithOneRetry(sizes, nameFromFile(card.file.name));
      if (result.status === 201) this.doneSinceIdle = true;
      this.land(card.id, {
        state: result.status === 201 ? "done" : "duplicate",
        imageId: result.id,
      });
    } catch (error) {
      this.land(card.id, { state: "failed", reason: uploadReason(error) });
    }
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
      this.uploads.pause();
      this.pause = sleep(seconds * 1000).then(() => {
        this.pause = null;
        if (!this.disposed) this.uploads.start();
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
