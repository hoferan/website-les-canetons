<?php

namespace App\Support;

use App\Models\ContentBlock;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\PhotoSlot;
use App\Models\Section;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Replaces a server's website with another's (#336, ADR 0039).
 *
 * One transaction: the content blocks, the photo slots and the history are replaced
 * together, or the server keeps what it had. An event's poster belongs to
 * its event and is left alone. No library photo is deleted: an event's
 * poster may use one, and a spare photo costs nothing.
 *
 * A register's photo is moved to the register of the same name here, since
 * ids differ between servers. One whose register does not exist here is
 * skipped and reported, never placed on a register that happens to have the
 * same id.
 */
final class WebsiteImport
{
    /**
     * @param  array{blocks: list<array{key: string, data: array<string, mixed>}>, slots: list<array{slot: string, sha256: string, label?: ?string, path?: ?string, registerName?: ?string}>, history: list<array<string, mixed>>}  $bundle
     * @return array{blocks: int, slots: int, history: int, skipped: list<array{slot: string, registerName: string}>}
     */
    public static function apply(array $bundle): array
    {
        $images = Image::query()->pluck('id', 'sha256');
        $registers = Section::query()->pluck('id', 'name');
        $skipped = [];
        $slots = [];

        foreach ($bundle['slots'] as $slot) {
            $key = $slot['slot'];
            $registerName = $slot['registerName'] ?? null;
            if ($registerName !== null) {
                $registerId = $registers[$registerName] ?? null;
                if ($registerId === null) {
                    $skipped[] = ['slot' => $key, 'registerName' => $registerName];

                    continue;
                }
                $key = "register-{$registerId}";
            }
            $slots[$key] = [
                'slot' => $key,
                'image_id' => $images[$slot['sha256']],
                'label' => $slot['label'] ?? null,
                'path' => $slot['path'] ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        DB::transaction(function () use ($bundle, $slots, $images): void {
            ContentBlock::query()->delete();
            foreach ($bundle['blocks'] as $block) {
                ContentBlock::query()->create(['key' => $block['key'], 'data' => $block['data']]);
            }

            // History slots go with their entries; event posters stay.
            PhotoSlot::query()->where('slot', 'not like', 'event-%')->delete();
            HistoryEntry::query()->delete();

            PhotoSlot::query()->insert(array_values($slots));

            foreach ($bundle['history'] as $row) {
                $precision = HistoryPrecision::from($row['precision']);
                $entry = HistoryEntry::query()->create([
                    'occurred_on' => $precision->truncate(CarbonImmutable::parse($row['occurredOn']))->toDateString(),
                    'precision' => $precision->value,
                    'title_fr' => $row['titleFr'] ?? null,
                    'body_fr' => $row['bodyFr'] ?? null,
                    'title_de' => $row['titleDe'] ?? null,
                    'body_de' => $row['bodyDe'] ?? null,
                    'important' => (bool) $row['important'],
                    'icon' => $row['icon'] ?? null,
                ]);
                if (($row['photoSha256'] ?? null) !== null) {
                    PhotoSlot::query()->insert([
                        'slot' => PhotoSlot::forHistory($entry->id),
                        'image_id' => $images[$row['photoSha256']],
                        'label' => null,
                        'path' => '/history',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        });

        return [
            'blocks' => count($bundle['blocks']),
            'slots' => count($slots),
            'history' => count($bundle['history']),
            'skipped' => $skipped,
        ];
    }
}
