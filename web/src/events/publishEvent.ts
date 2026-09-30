import { eventPublish, eventShow } from "../api/generated/endpoints";
import { entityTagOf, ifMatch } from "../api/ifMatch";

/**
 * Publish one event.
 *
 * A conditional write, so it owes the tag of a read of the event. A caller that
 * has just written it usually holds one (a PATCH hands out the new tag) and
 * passes it; a caller that has only created it has none, because a create
 * hands out no tag, and it is read here. Either way the tag describes the
 * state being published, not a fresher one.
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
