<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One public text the band has changed, keyed by its catalogue path. See the
 * text_overrides migration for why the key is free.
 *
 * @property string $key
 * @property string|null $fr
 * @property string|null $de
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class TextOverride extends Model
{
    /**
     * What a key may be: dot-separated segments of letters and digits, the
     * first starting with a lower-case letter, two to eight segments. That is
     * the shape of a path in the SPA's catalogue. Used as the route's
     * constraint, so anything else is a 404 that never reaches the database.
     */
    public const KEY = '[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+){1,7}';

    /** The longest key the column holds. */
    public const MAX_KEY_LENGTH = 128;

    /** The longest text in either language. */
    public const MAX_LENGTH = 2000;

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'fr', 'de'];
}
