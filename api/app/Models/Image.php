<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * One photo in the shared library (#105), stored in up to three sizes.
 *
 * `name` is the committee's label for the photo, never shown to visitors.
 * `sha256`, `width` and `height` describe the largest size; `bytes` is the
 * total of all of them. Replacing the photo changes all four, and with
 * `sha256` every URL of the photo.
 *
 * @property int $id
 * @property string $name
 * @property string $sha256
 * @property int $width
 * @property int $height
 * @property int $bytes
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Collection<int, ImageFile> $sizes
 */
class Image extends Model
{
    protected $fillable = ['name', 'sha256', 'width', 'height', 'bytes'];

    /**
     * Every resource that shows a photo lists its sizes, so they come with
     * every read. Loading them here rather than at each call site keeps a list
     * of photos at one extra query, however long it is.
     *
     * @var list<string>
     */
    protected $with = ['sizes'];

    /** Columns of image_files that are safe to load anywhere. Everything but `data`. */
    public const SIZE_COLUMNS = ['image_id', 'width', 'height', 'bytes', 'sha256'];

    /**
     * The photo's sizes, smallest first, WITHOUT their bytes.
     *
     * The select is load-bearing: `data` is up to 600 KB a row, and only
     * ImageFileController may read it, one row at a time. A test listens to
     * every query of the library and the public pages and fails if one names
     * that column.
     *
     * @return HasMany<ImageFile, $this>
     */
    public function sizes(): HasMany
    {
        return $this->hasMany(ImageFile::class)->select(self::SIZE_COLUMNS)->orderBy('width');
    }

    protected function casts(): array
    {
        return [
            'width' => 'integer',
            'height' => 'integer',
            'bytes' => 'integer',
        ];
    }

    /**
     * Set by loadUsages() for a list of images read together.
     *
     * @var list<array{kind: 'band'|'concert'|'register'|'history', id: ?int, label: ?string}>|null
     */
    private ?array $loadedUsages = null;

    /**
     * Every place this image is shown.
     *
     * `id` and `label` are null for the two band-page slots: they are named by
     * their kind alone.
     *
     * Answers what loadUsages() found when it was called on this instance, and
     * queries otherwise.
     *
     * @return list<array{kind: 'band'|'concert'|'register'|'history', id: ?int, label: ?string}>
     */
    public function usages(): array
    {
        return $this->loadedUsages ?? self::usagesOf([$this->id])[$this->id] ?? [];
    }

    /**
     * Reads the usages of every image in the collection at once, so that
     * rendering a page of the library costs three queries rather than three per
     * image.
     *
     * @param  iterable<Image>  $images
     */
    public static function loadUsages(iterable $images): void
    {
        $byId = [];
        foreach ($images as $image) {
            $byId[$image->id] = $image;
        }

        $usages = self::usagesOf(array_keys($byId));

        foreach ($byId as $id => $image) {
            $image->loadedUsages = $usages[$id] ?? [];
        }
    }

    /**
     * One query per kind of placement, for any number of images. A join
     * across three unrelated tables would be harder to read than the three
     * queries it saves.
     *
     * @param  list<int>  $ids
     * @return array<int, list<array{kind: 'band'|'concert'|'register'|'history', id: ?int, label: ?string}>>
     */
    private static function usagesOf(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $usages = [];

        foreach (SitePhoto::query()->whereIn('image_id', $ids)->orderBy('slot')->get() as $photo) {
            $usages[$photo->image_id][] = ['kind' => $photo->slot, 'id' => null, 'label' => null];
        }

        foreach (Section::query()->whereIn('image_id', $ids)->orderBy('sort_order')->get() as $section) {
            $usages[$section->image_id][] = ['kind' => 'register', 'id' => $section->id, 'label' => $section->name];
        }

        foreach (HistoryEntry::query()->whereIn('image_id', $ids)->orderBy('occurred_on')->get() as $entry) {
            $usages[$entry->image_id][] = ['kind' => 'history', 'id' => $entry->id, 'label' => $entry->title_fr ?? $entry->title_de];
        }

        return $usages;
    }

    public function isUsed(): bool
    {
        return SitePhoto::query()->where('image_id', $this->id)->exists()
            || Section::query()->where('image_id', $this->id)->exists()
            || HistoryEntry::query()->where('image_id', $this->id)->exists();
    }
}
