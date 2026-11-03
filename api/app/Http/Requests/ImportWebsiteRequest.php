<?php

namespace App\Http\Requests;

use App\Http\Controllers\Api\WebsiteController;
use App\Models\ContentBlock;
use App\Models\PhotoSlot;
use App\Support\BlockShape;
use App\Support\HistoryIcon;
use App\Support\HistoryPrecision;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\NestedRules;
use Illuminate\Validation\Rule;

/**
 * A website as GET /website/export wrote it, less the photos: the browser
 * uploads those to the library first, and everything here names them by the
 * SHA-256 of their largest size. Every photo must already be in the library,
 * or nothing is imported.
 */
class ImportWebsiteRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>|NestedRules> */
    public function rules(): array
    {
        $sha256 = ['string', 'size:64', 'exists:images,sha256'];

        return [
            // min/max rather than `in`, which the document would show as a string.
            /** The bundle's shape. Only `2` is read. */
            'format' => ['required', 'integer', 'min:'.WebsiteController::FORMAT, 'max:'.WebsiteController::FORMAT],
            /** The changed content blocks, as GET /blocks lists them. They replace every stored block. */
            'blocks' => ['present', 'array', 'max:200'],
            'blocks.*.key' => ['required', 'distinct', 'string', 'max:'.ContentBlock::MAX_KEY_LENGTH, 'regex:/^'.ContentBlock::KEY.'$/'],
            // `present`: `required` would refuse an empty object.
            /**
             * The block's content, under the same limits as PUT /blocks/{key}.
             *
             * @var array<string, mixed>
             */
            'blocks.*.data' => ['present', 'array', function (string $attribute, mixed $value, Closure $fail): void {
                $problem = BlockShape::check($value);
                if ($problem !== null) {
                    $fail($problem);
                }
            }],
            /** The photo slots, an event's poster and a history entry's photo aside. They replace every other slot. */
            'slots' => ['present', 'array', 'max:200'],
            'slots.*.slot' => ['required', 'distinct', 'string', 'regex:/^'.PhotoSlot::KEY.'$/', 'not_regex:/^(event|history)-\d+$/'],
            'slots.*.sha256' => ['required', ...$sha256],
            'slots.*.label' => ['nullable', 'string', 'max:120'],
            'slots.*.path' => ['nullable', 'string', 'max:255', 'starts_with:/'],
            /** For a register's photo, the register's name: the slot goes to the register of that name here. */
            // Required on a register's photo and refused anywhere else: without
            // it, register-5 would land on whatever register has id 5 here.
            'slots.*.registerName' => Rule::forEach(fn (mixed $value, string $attribute): array => preg_match(
                '/^register-\d+$/',
                (string) $this->input(str_replace('.registerName', '.slot', $attribute)),
            ) === 1 ? ['required', 'string', 'max:255'] : ['prohibited']),
            /** The history, oldest first. It replaces every entry. */
            'history' => ['present', 'array', 'max:500'],
            'history.*.occurredOn' => ['required', 'date'],
            'history.*.precision' => ['required', HistoryPrecision::rule()],
            'history.*.titleFr' => ['nullable', 'string', 'max:120'],
            'history.*.bodyFr' => ['nullable', 'string', 'max:5000'],
            'history.*.titleDe' => ['nullable', 'string', 'max:120'],
            'history.*.bodyDe' => ['nullable', 'string', 'max:5000'],
            'history.*.important' => ['required', 'boolean'],
            'history.*.icon' => ['nullable', HistoryIcon::rule()],
            'history.*.photoSha256' => ['nullable', ...$sha256],
        ];
    }
}
