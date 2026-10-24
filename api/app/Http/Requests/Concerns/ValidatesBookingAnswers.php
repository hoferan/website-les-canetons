<?php

namespace App\Http\Requests\Concerns;

use App\Models\Event;
use App\Models\RegistrationOption;
use App\Support\OptionKind;
use Closure;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * The answers half of a booking, shared by a guest's booking and a member's
 * (ADR 0032, ADR 0034): `choices`, each answer against its block's kind, the
 * required blocks, and the people count against both ends.
 *
 * The using request reads the event from its `{event}` route parameter.
 */
trait ValidatesBookingAnswers
{
    /**
     * `choices` is capped at 20 because each element costs an exists query.
     * Each `optionId` is scoped to this event's options, since the foreign key
     * would accept another event's option. `quantity` has a max because the
     * column is an unsignedInteger and an out-of-range value would be a 500.
     *
     * @return array<string, array<int, mixed>>
     */
    protected function choiceRules(): array
    {
        $event = $this->route('event');
        $eventId = $event instanceof Event ? $event->id : 0;

        return [
            /**
             * The answers, one entry per block answered, at most 20. A quantity sends `quantity`; text, choice and yes/no send `value`. Leave out a block not answered. Fails with `too_many_guests` when the quantities that count people exceed the event per-booking cap, and with `no_guests` when the form has such blocks and they add up to nobody.
             *
             * @example [{"optionId":7,"quantity":2},{"optionId":9,"value":"yes"}]
             */
            'choices' => ['present', 'array', 'max:20'],

            /** An option offered by this event, from `GET /api/v1/events/{event}/registration`. Each option may appear at most once in `choices`. */
            'choices.*.optionId' => [
                'required',
                'integer',
                // A repeated option would violate
                // UNIQUE(registration_id, option_id) inside the transaction
                // and answer 500.
                'distinct',
                Rule::exists('event_registration_options', 'id')->where('event_id', $eventId),
            ],
            /** Quantities only, and required there: how many, 1 to 50. Order the same option twice by raising this, not by repeating the entry. */
            'choices.*.quantity' => ['nullable', 'integer', 'gt:0', 'max:50'],
            /** Every other answered kind: the text, up to 1000 characters; the chosen answer's `id`; or `yes` / `no`. Anything else fails with `not_an_answer`. */
            'choices.*.value' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * Every check that needs the event's blocks: each answer against its
     * kind, the required blocks, and the people count against both ends.
     *
     * A closure, because each rule depends on the option an entry names. The
     * tokens must stay without params: ApiError's closure-added branch emits
     * `field` and `reason` only, and i18next prints a missing interpolation
     * literally.
     */
    protected function answersCheck(): Closure
    {
        return function (Validator $validator): void {
            $event = $this->route('event');

            if (! $event instanceof Event) {
                return;
            }

            $options = $event->registrationOptions()->get()->keyBy('id');
            $choices = array_values(array_filter((array) $this->input('choices', []), 'is_array'));

            foreach ($choices as $index => $choice) {
                $option = $options->get((int) ($choice['optionId'] ?? 0));

                if ($option === null) {
                    continue;
                }

                if ($option->kind === OptionKind::Quantity) {
                    if (($choice['quantity'] ?? null) === null) {
                        $validator->errors()->add("choices.{$index}.quantity", 'required');
                    }
                } elseif (! self::isAnAnswer($option, $choice['value'] ?? null)) {
                    $validator->errors()->add("choices.{$index}.value", 'not_an_answer');
                }
            }

            // Against `answers.<optionId>`, not a position in `choices`:
            // an unanswered block has no position, and the form needs to
            // know which block to mark.
            foreach ($options->filter(fn (RegistrationOption $o) => $o->required && $o->kind->isInput()) as $option) {
                if (! self::answers($option, $choices)) {
                    $validator->errors()->add("answers.{$option->id}", 'required');
                }
            }

            $people = $options->filter(fn (RegistrationOption $o) => $o->counts_guests);

            if ($people->isEmpty()) {
                return;
            }

            $requested = collect($choices)
                ->filter(fn (array $choice) => $people->has((int) ($choice['optionId'] ?? 0)))
                ->sum(fn (array $choice) => (int) ($choice['quantity'] ?? 0));

            // The migrated souper has only optional menus, so per-block
            // `required` cannot say "a meal, adult or child".
            if ($requested === 0) {
                $validator->errors()->add('choices', 'no_guests');
            } elseif ($event->registration_max_guests !== null && $requested > $event->registration_max_guests) {
                $validator->errors()->add('choices', 'too_many_guests');
            }
        };
    }

    /**
     * Whether a non-quantity value fits its block.
     *
     * Null passes and counts as no answer (see answers()): TrimStrings and
     * ConvertEmptyStringsToNull turn a blank text into null before this runs,
     * and a field left blank is not a wrong answer.
     */
    private static function isAnAnswer(RegistrationOption $option, mixed $value): bool
    {
        if ($value === null) {
            return true;
        }

        if (! is_string($value)) {
            return false;
        }

        return match ($option->kind) {
            OptionKind::Text => true,
            OptionKind::YesNo => in_array($value, ['yes', 'no'], true),
            OptionKind::Choice => in_array($value, array_column($option->answers(), 'id'), true),
            default => false,
        };
    }

    /**
     * Whether the booking answers this block.
     *
     * @param  list<array<string, mixed>>  $choices
     */
    private static function answers(RegistrationOption $option, array $choices): bool
    {
        foreach ($choices as $choice) {
            if ((int) ($choice['optionId'] ?? 0) !== $option->id) {
                continue;
            }

            // is_string, not a cast: after() runs even when the rules failed,
            // and an array cast to string is a 500, not a 400.
            $value = $choice['value'] ?? null;

            return $option->kind === OptionKind::Quantity
                ? (int) ($choice['quantity'] ?? 0) > 0
                : is_string($value) && trim($value) !== '';
        }

        return false;
    }
}
