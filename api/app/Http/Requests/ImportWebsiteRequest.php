<?php

namespace App\Http\Requests;

use App\Http\Controllers\Api\WebsiteController;
use App\Models\PhotoSlot;
use App\Models\TextOverride;
use App\Support\HistoryIcon;
use App\Support\HistoryPrecision;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A website as GET /website/export wrote it, less the photos: the browser
 * uploads those to the library first, and everything here names them by the
 * SHA-256 of their largest size. Every photo must already be in the library,
 * or nothing is imported.
 */
class ImportWebsiteRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        $sha256 = ['string', 'size:64', 'exists:images,sha256'];

        return [
            /** The bundle's shape. Only `1` is read. */
            'format' => ['required', 'integer', 'in:'.WebsiteController::FORMAT],
            /** The changed texts, as GET /texts lists them. They replace every stored text. */
            'texts' => ['present', 'array', 'max:500'],
            'texts.*.key' => ['required', 'string', 'max:'.TextOverride::MAX_KEY_LENGTH, 'regex:/^'.TextOverride::KEY.'$/'],
            'texts.*.fr' => ['present', 'nullable', 'string', 'max:'.TextOverride::MAX_LENGTH],
            'texts.*.de' => ['present', 'nullable', 'string', 'max:'.TextOverride::MAX_LENGTH],
            /** The photo slots, an event's poster and a history entry's photo aside. They replace every other slot. */
            'slots' => ['present', 'array', 'max:200'],
            'slots.*.slot' => ['required', 'string', 'regex:/^'.PhotoSlot::KEY.'$/', 'not_regex:/^(event|history)-\d+$/'],
            'slots.*.sha256' => ['required', ...$sha256],
            'slots.*.label' => ['nullable', 'string', 'max:120'],
            'slots.*.path' => ['nullable', 'string', 'max:255', 'starts_with:/'],
            /** For a register's photo, the register's name: the slot goes to the register of that name here. */
            'slots.*.registerName' => ['nullable', 'string', 'max:255'],
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
