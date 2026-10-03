import { describe, expect, it } from "vitest";

import { ApiError } from "../api/http";
import { ShrinkError } from "./shrink";
import { type Card, UploadQueue } from "./uploadQueue";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function files(n: number): File[] {
  return Array.from(
    { length: n },
    (_, i) => new File(["x"], `p${i + 1}.jpg`, { type: "image/jpeg" }),
  );
}

/** A promise a test settles by hand, so concurrency is observable. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const states = (cards: Card[]) => cards.map((c) => c.state);

function harness(
  overrides: {
    shrinker?: (file: File) => Promise<Blob[]>;
    upload?: (sizes: Blob[], name: string) => Promise<{ status: 200 | 201; id: number }>;
  } = {},
) {
  let id = 0;
  const queue = new UploadQueue({
    shrinker: overrides.shrinker ?? (async () => [new Blob(["j"])]),
    upload: overrides.upload ?? (async () => ({ status: 201, id: ++id })),
    sleep: async () => {},
  });
  return queue;
}

describe("UploadQueue", () => {
  it("never shrinks two at once", async () => {
    let active = 0;
    let peak = 0;
    const queue = harness({
      shrinker: async () => {
        active++;
        peak = Math.max(peak, active);
        await settle();
        active--;
        return [new Blob(["j"])];
      },
    });
    queue.add(files(5));
    for (let i = 0; i < 20; i++) await settle();
    expect(peak).toBe(1);
    expect(states(queue.getSnapshot())).toEqual(Array(5).fill("done"));
  });

  it("never uploads more than two at once", async () => {
    let active = 0;
    let peak = 0;
    const queue = harness({
      upload: async () => {
        active++;
        peak = Math.max(peak, active);
        await settle();
        active--;
        return { status: 201, id: 1 };
      },
    });
    queue.add(files(6));
    for (let i = 0; i < 30; i++) await settle();
    expect(peak).toBe(2);
    expect(states(queue.getSnapshot())).toEqual(Array(6).fill("done"));
  });

  it("holds a shrunk card back while both upload slots are busy", async () => {
    const gates = [
      deferred<{ status: 201; id: number }>(),
      deferred<{ status: 201; id: number }>(),
    ];
    let call = 0;
    const queue = harness({ upload: () => (gates[call++] ?? deferred<never>()).promise });
    queue.add(files(4));
    await settle();
    await settle();
    await settle();
    expect(states(queue.getSnapshot())).toEqual(["uploading", "uploading", "shrinking", "waiting"]);
    gates[0]?.resolve({ status: 201, id: 1 });
    await settle();
    expect(states(queue.getSnapshot()).slice(0, 3)).toEqual(["done", "uploading", "uploading"]);
  });

  it("a failure does not stop the queue", async () => {
    let n = 0;
    const queue = harness({
      upload: async () => {
        n++;
        if (n === 2) throw new ApiError(422, "validation_failed", "x");
        return { status: 201, id: n };
      },
    });
    queue.add(files(3));
    for (let i = 0; i < 20; i++) await settle();
    expect(states(queue.getSnapshot())).toEqual(["done", "failed", "done"]);
    expect(queue.getSnapshot()[1]?.reason).toBe("rejected");
  });

  it("retry re-runs only that card", async () => {
    let fail = true;
    let uploads = 0;
    const queue = harness({
      upload: async () => {
        uploads++;
        if (fail) throw new ApiError(422, "validation_failed", "x");
        return { status: 201, id: uploads };
      },
    });
    queue.add(files(2));
    for (let i = 0; i < 20; i++) await settle();
    expect(states(queue.getSnapshot())).toEqual(["failed", "failed"]);
    fail = false;
    const before = uploads;
    queue.retry(queue.getSnapshot()[0]?.id ?? "");
    for (let i = 0; i < 20; i++) await settle();
    expect(states(queue.getSnapshot())).toEqual(["done", "failed"]);
    expect(uploads - before).toBe(1);
  });

  it("retryAllFailed re-runs every failed card", async () => {
    let fail = true;
    const queue = harness({
      upload: async () => {
        if (fail) throw new ApiError(422, "validation_failed", "x");
        return { status: 201, id: 1 };
      },
    });
    queue.add(files(3));
    for (let i = 0; i < 20; i++) await settle();
    fail = false;
    queue.retryAllFailed();
    for (let i = 0; i < 20; i++) await settle();
    expect(states(queue.getSnapshot())).toEqual(["done", "done", "done"]);
  });

  it("200 marks the card duplicate", async () => {
    const queue = harness({ upload: async () => ({ status: 200, id: 7 }) });
    queue.add(files(1));
    for (let i = 0; i < 10; i++) await settle();
    expect(queue.getSnapshot()[0]).toMatchObject({ state: "duplicate", imageId: 7 });
  });

  it("marks overflow cards full and finishes the rest", async () => {
    let n = 0;
    const queue = harness({
      upload: async () => {
        n++;
        if (n === 3 || n === 4) throw new ApiError(409, "image_library_full", "full");
        return { status: 201, id: n };
      },
    });
    queue.add(files(5));
    for (let i = 0; i < 30; i++) await settle();
    const cards = queue.getSnapshot();
    expect(states(cards)).toEqual(["done", "done", "failed", "failed", "done"]);
    expect(cards[2]?.reason).toBe("image_library_full");
    expect(cards[3]?.reason).toBe("image_library_full");
  });

  it("reports a database out of room as such, not as a network failure", async () => {
    const queue = harness({
      upload: async () => {
        throw new ApiError(507, "image_storage_full", "full");
      },
    });
    queue.add(files(1));
    for (let i = 0; i < 10; i++) await settle();
    expect(queue.getSnapshot()[0]).toMatchObject({ state: "failed", reason: "image_storage_full" });
  });

  it("sends every size of a photo in one upload", async () => {
    const sizes = [new Blob(["large"]), new Blob(["mid"]), new Blob(["s"])];
    const sent: Blob[][] = [];
    const queue = harness({
      shrinker: async () => sizes,
      upload: async (set) => {
        sent.push(set);
        return { status: 201, id: 1 };
      },
    });
    queue.add(files(1));
    for (let i = 0; i < 10; i++) await settle();
    expect(sent).toEqual([sizes]);
  });

  it("names each photo after its file", async () => {
    const names: string[] = [];
    const queue = harness({
      upload: async (_sizes, name) => {
        names.push(name);
        return { status: 201, id: names.length };
      },
    });
    queue.add([
      new File(["x"], "  Carnaval   2026.JPG", { type: "image/jpeg" }),
      new File(["x"], ".jpg", { type: "image/jpeg" }),
    ]);
    for (let i = 0; i < 20; i++) await settle();
    expect(names).toEqual(["Carnaval 2026", "Photo"]);
  });

  it("a 429 waits and retries once", async () => {
    const waits: number[] = [];
    let n = 0;
    const queue = new UploadQueue({
      shrinker: async () => [new Blob(["j"])],
      upload: async () => {
        n++;
        if (n === 1) throw new ApiError(429, "too_many_requests", "slow");
        return { status: 201, id: 1 };
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    queue.add(files(1));
    for (let i = 0; i < 10; i++) await settle();
    expect(waits).toEqual([5000]);
    expect(n).toBe(2);
    expect(queue.getSnapshot()[0]?.state).toBe("done");
  });

  it("fails as network when the second attempt is 429 too", async () => {
    let n = 0;
    const queue = harness({
      upload: async () => {
        n++;
        throw new ApiError(429, "too_many_requests", "slow");
      },
    });
    queue.add(files(1));
    for (let i = 0; i < 10; i++) await settle();
    expect(n).toBe(2);
    expect(queue.getSnapshot()[0]).toMatchObject({ state: "failed", reason: "network" });
  });

  it("fails an unreadable or unsupported card and moves on", async () => {
    let n = 0;
    const queue = harness({
      shrinker: async () => {
        n++;
        if (n === 1) throw new ShrinkError("unreadable");
        if (n === 2) throw new ShrinkError("unsupported");
        return [new Blob(["j"])];
      },
    });
    queue.add(files(3));
    for (let i = 0; i < 20; i++) await settle();
    const cards = queue.getSnapshot();
    expect(states(cards)).toEqual(["failed", "failed", "done"]);
    expect(cards.map((c) => c.reason)).toEqual(["unreadable", "unsupported", undefined]);
  });

  it("is busy until every card has settled", async () => {
    const gate = deferred<{ status: 201; id: number }>();
    const queue = harness({ upload: () => gate.promise });
    expect(queue.isBusy()).toBe(false);
    queue.add(files(1));
    await settle();
    expect(queue.isBusy()).toBe(true);
    gate.resolve({ status: 201, id: 1 });
    await settle();
    await settle();
    expect(queue.isBusy()).toBe(false);
  });

  it("fails a non-API rejection as network", async () => {
    const queue = harness({
      upload: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    queue.add(files(1));
    for (let i = 0; i < 10; i++) await settle();
    expect(queue.getSnapshot()[0]).toMatchObject({ state: "failed", reason: "network" });
  });

  it("waits the server's Retry-After, and starts no other upload meanwhile", async () => {
    const waits: number[] = [];
    const wake = deferred<void>();
    let started = 0;
    let first = true;
    const queue = new UploadQueue({
      shrinker: async () => [new Blob(["j"])],
      upload: async () => {
        started++;
        if (first) {
          first = false;
          throw new ApiError(429, "rate_limited", "slow", [], undefined, 30);
        }
        return { status: 201, id: started };
      },
      sleep: (ms) => {
        waits.push(ms);
        return wake.promise;
      },
    });
    queue.add(files(3));
    for (let i = 0; i < 10; i++) await settle();
    expect(waits).toEqual([30_000]);
    // Only the refused upload has been attempted; the other cards sit behind the pause.
    expect(started).toBe(1);
    wake.resolve();
    for (let i = 0; i < 20; i++) await settle();
    expect(states(queue.getSnapshot())).toEqual(["done", "done", "done"]);
  });

  it("clamps Retry-After to 1-65 seconds", async () => {
    const waits: number[] = [];
    for (const retryAfter of [0, 3600]) {
      let first = true;
      const queue = new UploadQueue({
        shrinker: async () => [new Blob(["j"])],
        upload: async () => {
          if (first) {
            first = false;
            throw new ApiError(429, "rate_limited", "slow", [], undefined, retryAfter);
          }
          return { status: 201, id: 1 };
        },
        sleep: async (ms) => {
          waits.push(ms);
        },
      });
      queue.add(files(1));
      for (let i = 0; i < 10; i++) await settle();
    }
    expect(waits).toEqual([1000, 65_000]);
  });

  it("reports settled once per burst, not once per photo", async () => {
    let settled = 0;
    const queue = new UploadQueue({
      shrinker: async () => [new Blob(["j"])],
      upload: async () => ({ status: 201, id: 1 }),
      onSettled: () => settled++,
    });
    queue.add(files(5));
    for (let i = 0; i < 30; i++) await settle();
    expect(settled).toBe(1);
  });

  it("keeps an uploaded card done even when onSettled throws", async () => {
    const queue = new UploadQueue({
      shrinker: async () => [new Blob(["j"])],
      upload: async () => ({ status: 201, id: 1 }),
      onSettled: () => {
        throw new Error("boom");
      },
    });
    queue.add(files(1));
    for (let i = 0; i < 10; i++) await settle();
    expect(queue.getSnapshot()[0]?.state).toBe("done");
  });

  it("stops scheduling after dispose, leaving waiting cards waiting", async () => {
    const gate = deferred<{ status: 201; id: number }>();
    const queue = harness({ upload: () => gate.promise });
    queue.add(files(3));
    await settle();
    await settle();
    queue.dispose();
    gate.resolve({ status: 201, id: 1 });
    for (let i = 0; i < 10; i++) await settle();
    expect(states(queue.getSnapshot())[0]).toBe("done");
    // The third card was never handed an upload slot.
    expect(states(queue.getSnapshot())[2]).not.toBe("done");
    expect(states(queue.getSnapshot())).not.toContain("uploading");
  });

  it("answers add() with the ids of the cards it queued", () => {
    const queue = harness({ shrinker: () => new Promise(() => {}) });
    const ids = queue.add(files(2));
    expect(ids).toEqual(queue.getSnapshot().map((card) => card.id));
    expect(queue.add([])).toEqual([]);
  });

  it("settles one card's promise with the card once it lands, whichever way", async () => {
    const names = new Map<Blob, string>();
    const queue = harness({
      shrinker: async (file) => {
        const blob = new Blob(["j"]);
        names.set(blob, file.name);
        return [blob];
      },
      upload: async ([blob]) => {
        if (blob && names.get(blob) === "bad.jpg")
          throw new ApiError(422, "validation_failed", "x");
        return { status: 200, id: 7 };
      },
    });
    const [good] = queue.add([new File(["x"], "good.jpg", { type: "image/jpeg" })]);
    const [bad] = queue.add([new File(["x"], "bad.jpg", { type: "image/jpeg" })]);

    await expect(queue.settled(good ?? "")).resolves.toMatchObject({
      state: "duplicate",
      imageId: 7,
    });
    await expect(queue.settled(bad ?? "")).resolves.toMatchObject({
      state: "failed",
      reason: "rejected",
    });
    // A card that has already landed answers at once.
    await expect(queue.settled(good ?? "")).resolves.toMatchObject({ state: "duplicate" });
  });
});
