<?php

namespace App\Http\Resources;

use App\Models\RegistrationOption;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One block as the committee's form editor sees it: the public shape, plus
 * what bookings already hold it in place.
 *
 * The flags say before a save what the PUT would refuse
 * (`option_has_registrations`, `choice_answer_in_use`), so the editor can
 * leave out a remove button instead of failing after the tap. The PUT stays
 * the real check. They are not on the public form, which has no use for who
 * answered what, and the `event.options` tag reads RegistrationOptionResource,
 * so a guest booking does not move it.
 *
 * It wraps that resource rather than extending it: extended, Scramble
 * documented the collection as the parent's and the two flags went missing
 * from the generated client.
 *
 * Expects `answered` from `withExists('choices as answered')` and
 * `picked_answer_ids` set by the controller.
 *
 * @mixin RegistrationOption
 */
class EditableRegistrationOptionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            ...(new RegistrationOptionResource($this->resource))->toArray($request),
            /** Whether any booking answered this block. Answered, it cannot be removed or change kind. */
            'answered' => (bool) $this->resource->getAttribute('answered'),
            /**
             * The answers of a choice that some booking picked, which cannot be removed. Empty on every other kind.
             *
             * @var list<string>
             */
            'pickedAnswerIds' => $this->resource->getAttribute('picked_answer_ids') ?? [],
        ];
    }
}
