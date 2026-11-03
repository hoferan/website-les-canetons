<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One content block of the public pages that the band has changed, keyed by
 * the name the SPA gives it. See the content_blocks migration for why the key
 * and the data are free.
 *
 * @property string $key
 * @property array<string, mixed> $data
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class ContentBlock extends Model
{
    /**
     * What a key may be: a lower-case word, then up to three more dot-separated
     * segments of lower-case letters, digits and hyphens. Used as the route's
     * constraint, so anything else is a 404 that never reaches the database.
     */
    public const KEY = '[a-z][a-z0-9-]*(?:\.[a-z0-9-]+){0,3}';

    /** The longest key the column holds. */
    public const MAX_KEY_LENGTH = 64;

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'data'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['data' => 'array'];
    }
}
