<?php

namespace App\Http\Requests;

use App\Models\Section;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Every photo placement, in one body.
 *
 * It is a replacement, like the answer of `GET /api/v1/photo-placements`, whose
 * shape it repeats: `band` and `concert` are slots, and `registers` lists
 * every register exactly once. A register missing from the list, listed twice
 * or not a register at all fails validation against `registers`. `name` on a
 * register row is read-only and ignored here.
 *
 * A slot is just `imageId`. It must be sent, and null empties the slot. An
 * `imageId` that is not in the library fails validation against `imageId`;
 * read the ids from `GET /api/v1/images`.
 */
class UpdatePhotoPlacementsRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // `present` rather than `required` for `imageId`: `required` rejects
        // the null that empties a slot.
        return [
            'band' => ['required', 'array'],
            ...$this->slotRules('band'),

            'concert' => ['required', 'array'],
            ...$this->slotRules('concert'),

            'registers' => ['required', 'array'],
            'registers.*.sectionId' => ['required', 'integer'],
            ...$this->slotRules('registers.*'),
        ];
    }

    /**
     * Whether `registers` names every register exactly once.
     *
     * A closure rather than a rule, because no single entry is wrong: the
     * list as a whole is. The token is bare and paramless, as ApiError
     * requires of anything added this way.
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $registers = $this->input('registers');

                if (! is_array($registers) || $validator->errors()->has('registers')) {
                    return;
                }

                $sent = array_map(
                    fn ($row) => is_array($row) && is_int($row['sectionId'] ?? null) ? $row['sectionId'] : null,
                    $registers,
                );
                $known = Section::query()->pluck('id')->all();

                sort($sent);
                sort($known);

                if ($sent !== $known) {
                    $validator->errors()->add('registers', 'invalid_value');
                }
            },
        ];
    }

    /** @return array<string, array<int, mixed>> */
    private function slotRules(string $prefix): array
    {
        return [
            "{$prefix}.imageId" => ['present', 'nullable', 'integer', 'exists:images,id'],
        ];
    }
}
