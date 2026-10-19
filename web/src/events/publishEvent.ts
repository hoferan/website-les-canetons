import { eventPublish, eventShow } from "../api/generated/endpoints";
import { entityTagOf, ifMatch } from "../api/ifMatch";

/**
 * Publish one event.
 *
 * A conditional write, so it needs the tag of a read of the event. A caller
 * that has just patched it passes the new tag; after a create there is none,
 * so the event is read here. Either way the tag describes the state being
 * published.
 *
 * Throws what the mutator throws: an ApiError for a refusal such as
 * `event_incomplete`, which names the missing fields.
 */
export async function publishEvent(id: number, etag: string | null = null): Promise<void> {
  let tag = etag;

  if (tag === null) {
    const read = await eventShow(id);
    tag = read.status === 200 ? entityTagOf(read) : null;
  }

  if (tag === null) {
    throw new Error("The event was read without a tag, so it cannot be published.");
  }

  await eventPublish(id, ifMatch(tag));
}
