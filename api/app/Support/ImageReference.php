<?php

namespace App\Support;

use App\Models\Image;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Validation\ValidationException;

/**
 * Turns a write that lost a race to an image delete into the refusal the
 * `exists:images,id` rule gives.
 *
 * The rule passes, another request deletes the image, and the write then
 * fails on the foreign key (MySQL 1452). Without this the caller sees a 500
 * and only a retry reaches the 400. The key still guards integrity either way.
 */
final class ImageReference
{
    /**
     * @template T
     *
     * @param  Closure(): T  $write
     * @param  array<string, int|null>  $references  request field => the image id it sends
     * @return T
     */
    public static function guard(Closure $write, array $references): mixed
    {
        try {
            return $write();
        } catch (QueryException $e) {
            if (($e->errorInfo[1] ?? null) !== 1452) {
                throw $e;
            }

            $sent = array_filter($references, fn (?int $id) => $id !== null);
            $present = Image::query()->whereKey(array_values($sent))->pluck('id')->all();
            $gone = array_filter($sent, fn (int $id) => ! in_array($id, $present, true));

            // Only an image the request sent can break the key. When the
            // re-read cannot say which one (a rolled-back delete can reappear
            // inside an enclosing transaction), name every image field sent.
            if ($gone === []) {
                $gone = $sent;
            }

            if ($gone === []) {
                throw $e;
            }

            // The bare token an unmapped `exists` failure renders as.
            throw ValidationException::withMessages(
                array_map(fn () => ['invalid_format'], $gone),
            );
        }
    }
}
