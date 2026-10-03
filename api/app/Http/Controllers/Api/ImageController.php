<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Middleware\ConditionalWrite;
use App\Http\Requests\ReplaceImageFileRequest;
use App\Http\Requests\StoreImageRequest;
use App\Http\Requests\UpdateImageRequest;
use App\Http\Resources\ImageResource;
use App\Models\Image;
use App\Support\Audit;
use App\Support\Emits;
use App\Support\EntityTag;
use Closure;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PDOException;
use Throwable;

#[Group('Images', 'The shared photo library. Every route here needs `images.manage`, except the file itself, which is public.', weight: 65)]
class ImageController extends Controller
{
    /** Advisory lock names are server-wide, hence the project prefix. */
    private const UPLOAD_LOCK = 'lescanetons_image_upload';

    /** Every image in the library, newest first, each with the places it is shown. Requires `images.manage`. */
    #[Endpoint(operationId: 'image.index')]
    #[Response(200, 'The whole library, newest first.')]
    public function index(): AnonymousResourceCollection
    {
        $images = Image::query()->orderByDesc('created_at')->orderByDesc('id')->get();
        Image::loadUsages($images);

        return ImageResource::collection($images);
    }

    /**
     * How full the library is. Requires `images.manage`.
     *
     * A separate read rather than `meta` on the list, because the collection
     * envelope is the same on every list and carries paging only.
     */
    #[Endpoint(operationId: 'image.summary')]
    #[Response(200, 'The number of images, how many the library holds at most, and their total size in bytes.')]
    public function summary(): JsonResponse
    {
        return response()->json([
            'count' => Image::query()->count(),
            'capacity' => (int) config('api.images.capacity'),
            'bytesTotal' => (int) Image::query()->sum('bytes'),
        ]);
    }

    /** One image, with the `ETag` its rename, replace and delete must quote. Requires `images.manage`. */
    #[Endpoint(operationId: 'image.show')]
    #[Response(200, 'The image and the places it is shown.')]
    public function show(Image $image): ImageResource
    {
        return new ImageResource($image);
    }

    /**
     * Adds a photo to the library, sent in one to three sizes with a name.
     * Requires `images.manage`.
     *
     * The largest size is the photo: its SHA-256 identifies it, and uploading
     * a photo whose largest size the library already holds adds nothing. The
     * existing image comes back with `200`, under its own name, even when the
     * library is full.
     *
     * Uploads are stored one at a time. One that waits too long for the
     * upload ahead of it answers `503 service_unavailable`; send it again. One
     * the database has no room for answers `507 image_storage_full`.
     */
    #[Endpoint(operationId: 'image.store')]
    #[Emits('image_library_full', 'image_storage_full')]
    #[Response(201, 'The image was added.', type: 'ImageResource')]
    #[Response(200, 'The library already held this photo, which is returned unchanged.', type: 'ImageResource')]
    public function store(StoreImageRequest $request): JsonResponse
    {
        $sizes = $this->withBytes($request->sizes());
        $name = $request->photoName();

        return $this->underUploadLock(fn (): JsonResponse => $this->insert($request, $name, $sizes));
    }

    /**
     * The upload's database work, run inside the transaction and under the
     * lock: the duplicate check, both caps, and the row with every size.
     *
     * @param  list<array{width: int, height: int, bytes: int, path: string, data: string}>  $sizes
     */
    private function insert(Request $request, string $name, array $sizes): JsonResponse
    {
        $sha256 = hash('sha256', $sizes[0]['data']);
        $bytes = array_sum(array_column($sizes, 'bytes'));

        $existing = Image::query()->where('sha256', $sha256)->first();
        if ($existing !== null) {
            return response()->json(new ImageResource($existing));
        }

        $full = Image::query()->count() >= (int) config('api.images.capacity')
            || (int) Image::query()->sum('bytes') + $bytes > (int) config('api.images.max_total_bytes');
        if ($full) {
            return $this->libraryFull();
        }

        try {
            $image = Image::query()->create([
                'name' => $name,
                'sha256' => $sha256,
                'width' => $sizes[0]['width'],
                'height' => $sizes[0]['height'],
                'bytes' => $bytes,
            ]);
        } catch (UniqueConstraintViolationException) {
            // The same photo arrived by a path that skipped the lock.
            return response()->json(new ImageResource(
                Image::query()->where('sha256', $sha256)->firstOrFail(),
            ));
        }

        $this->insertSizes($image->id, $sizes);

        Audit::record($request->user(), 'image.uploaded', 'image', $image->id, $sha256.'.jpg');

        return response()->json(new ImageResource($image->load('sizes')), 201);
    }

    /**
     * Renames an image. Requires `images.manage` and the `If-Match` from its
     * read.
     *
     * The name is the committee's label for the photo, shown in the library
     * and the picker. No public page shows it.
     */
    #[Endpoint(operationId: 'image.update')]
    #[Response(200, 'The image under its new name, with a new `ETag`.', type: 'ImageResource')]
    public function update(UpdateImageRequest $request, Image $image): JsonResponse
    {
        $name = $request->photoName();

        $renamed = DB::transaction(function () use ($request, $image, $name): ?Image {
            $current = $this->lockedIfCurrent($request, $image->id);
            if ($current === null || $current->name === $name) {
                return $current;
            }

            $current->update(['name' => $name]);
            Audit::record($request->user(), 'image.renamed', 'image', $current->id, $name);

            return $current;
        });

        // The row as read under the lock, so the body and the tag the
        // middleware adds describe the same state.
        return $renamed === null ? $this->stale() : response()->json(new ImageResource($renamed));
    }

    /**
     * Replaces the photo of an image with new sizes, sent exactly as an upload
     * sends them. Requires `images.manage` and the `If-Match` from its read.
     *
     * The image keeps its id, its name and every place it is shown, so each of
     * those pages shows the new photo. Its `url`, `srcset` and `sizes` change:
     * a size's path names the new bytes.
     *
     * Sending the photo the image already holds changes nothing and answers
     * `200`. One that another image in the library holds is refused with
     * `image_already_in_library`. The byte cap counts what the library would
     * hold after the swap, so a replacement only needs room for the
     * difference.
     *
     * Replacements and uploads are stored one at a time. One that waits too
     * long answers `503 service_unavailable`; send it again. One the database
     * has no room for answers `507 image_storage_full`.
     */
    #[Endpoint(operationId: 'image.replace')]
    #[Emits('image_already_in_library', 'image_library_full', 'image_storage_full')]
    #[Response(200, 'The image with its new sizes and a new `ETag`, or unchanged when it already held this photo.', type: 'ImageResource')]
    public function replace(ReplaceImageFileRequest $request, Image $image): JsonResponse
    {
        $sizes = $this->withBytes($request->sizes());

        return $this->underUploadLock(fn (): JsonResponse => $this->swap($request, $image->id, $sizes));
    }

    /**
     * The replacement's database work, run inside the transaction and under
     * the upload lock.
     *
     * @param  list<array{width: int, height: int, bytes: int, path: string, data: string}>  $sizes
     */
    private function swap(Request $request, int $id, array $sizes): JsonResponse
    {
        $image = $this->lockedIfCurrent($request, $id);
        if ($image === null) {
            return $this->stale();
        }

        $sha256 = hash('sha256', $sizes[0]['data']);
        $bytes = array_sum(array_column($sizes, 'bytes'));

        if ($image->sha256 === $sha256) {
            return response()->json(new ImageResource($image));
        }

        if (Image::query()->where('sha256', $sha256)->whereKeyNot($id)->exists()) {
            return $this->alreadyInLibrary();
        }

        // The count does not change, so only the bytes are capped, and only
        // by what the swap adds.
        $after = (int) Image::query()->sum('bytes') - $image->bytes + $bytes;
        if ($after > (int) config('api.images.max_total_bytes')) {
            return $this->libraryFull();
        }

        $previous = $image->sha256;

        // The row first: a unique violation here leaves the old sizes alone,
        // and MariaDB keeps the transaction open after a failed statement.
        try {
            $image->update([
                'sha256' => $sha256,
                'width' => $sizes[0]['width'],
                'height' => $sizes[0]['height'],
                'bytes' => $bytes,
            ]);
        } catch (UniqueConstraintViolationException) {
            return $this->alreadyInLibrary();
        }

        DB::table('image_files')->where('image_id', $id)->delete();
        $this->insertSizes($id, $sizes);

        Audit::record($request->user(), 'image.replaced', 'image', $id, $previous.'.jpg → '.$sha256.'.jpg');

        return response()->json(new ImageResource($image->load('sizes')));
    }

    /**
     * Deletes an image with all its sizes. Requires `images.manage` and the
     * `If-Match` from its read.
     *
     * Refused with `image_in_use` while anything still shows the image:
     * remove it from there first.
     */
    #[Endpoint(operationId: 'image.destroy')]
    #[Emits('image_in_use')]
    #[Response(200, 'Deleted, every size included.')]
    public function destroy(Request $request, Image $image): JsonResponse
    {
        $outcome = DB::transaction(function () use ($request, $image): string {
            // Locked first, so a placement being saved at the same moment
            // either commits before the check below sees it or waits for the
            // delete and fails on its foreign key.
            $current = $this->lockedIfCurrent($request, $image->id);
            if ($current === null) {
                return 'stale';
            }
            $image = $current;

            if ($image->isUsed()) {
                return 'in_use';
            }

            try {
                // image_files cascades, so the sizes go with the row.
                $image->delete();
                // @phpstan-ignore catch.neverThrown (Model::delete() declares only LogicException, but the DELETE it runs throws this when a foreign key refuses it)
            } catch (QueryException $e) {
                // Every placement is RESTRICT, so the database refuses what the
                // check above missed. 1451 is MySQL's "cannot delete a parent
                // row": a foreign key still points at it.
                if (($e->errorInfo[1] ?? null) === 1451) {
                    return 'in_use';
                }

                throw $e;
            }

            Audit::record($request->user(), 'image.deleted', 'image', $image->id, $image->sha256.'.jpg');

            return 'deleted';
        });

        return match ($outcome) {
            'stale' => $this->stale(),
            'in_use' => ApiError::json(409, 'image_in_use', 'This image is still shown on the site. Remove it from there first.'),
            default => response()->json(['ok' => true]),
        };
    }

    /**
     * The image, locked FOR UPDATE, when the request's `If-Match` still names
     * its state; null when it does not, or when the image is gone.
     *
     * ConditionalWrite checks the tag before the write holds any lock, so a
     * replacement, a rename or a delete can land in between and this write
     * would undo it unseen. Checked again here, nothing else can change the
     * image until the transaction commits. Every write on an image goes
     * through this.
     */
    private function lockedIfCurrent(Request $request, int $id): ?Image
    {
        $image = Image::query()->whereKey($id)->lockForUpdate()->first();
        $current = $image === null ? null : EntityTag::compute('image', $image);

        return $current !== null && ConditionalWrite::matches((string) $request->header('If-Match'), $current)
            ? $image
            : null;
    }

    private function stale(): JsonResponse
    {
        return ApiError::json(412, 'if_match_failed', 'The If-Match header does not match the current state');
    }

    /**
     * Each validated size with its bytes, read before the lock is taken so the
     * lock is held for the database work alone.
     *
     * @param  list<array{width: int, height: int, bytes: int, path: string}>  $sizes
     * @return list<array{width: int, height: int, bytes: int, path: string, data: string}>
     */
    private function withBytes(array $sizes): array
    {
        return array_map(fn (array $size): array => [
            ...$size,
            'data' => (string) file_get_contents($size['path']),
        ], $sizes);
    }

    /**
     * One statement per size, so no packet carries more than one 600 KB size
     * whatever max_allowed_packet the host sets.
     *
     * @param  list<array{width: int, height: int, bytes: int, path: string, data: string}>  $sizes
     */
    private function insertSizes(int $imageId, array $sizes): void
    {
        foreach ($sizes as $size) {
            DB::table('image_files')->insert([
                'image_id' => $imageId,
                'width' => $size['width'],
                'height' => $size['height'],
                'bytes' => $size['bytes'],
                // Computed here from the bytes being stored, never taken from
                // the request: the file route serves this row under it.
                'sha256' => hash('sha256', $size['data']),
                'data' => $size['data'],
            ]);
        }
    }

    /**
     * Runs an upload's or a replacement's database work in one transaction,
     * under the upload lock, and turns a database that has no room into
     * `507 image_storage_full`.
     *
     * One at a time, so neither of two writes can slip past the caps the other
     * is about to reach, or store the photo the other is storing. An advisory
     * lock rather than a locking read: on MariaDB 10.3, COUNT ... FOR UPDATE
     * deadlocks two uploads into an empty table, and an upload against a
     * concurrent delete.
     *
     * @param  Closure(): JsonResponse  $work
     */
    private function underUploadLock(Closure $work): JsonResponse
    {
        if (! $this->lockUploads()) {
            return ApiError::json(503, 'service_unavailable', 'Another upload is still running. Retry shortly.');
        }

        // Set inside the transaction, before its rollback runs: when the
        // connection is gone, Laravel throws the failed rollback's exception
        // instead of the one that caused it, and that one names no error code.
        /** @var int|null $refused set by reference inside the closure */
        $refused = null;

        try {
            return DB::transaction(function () use ($work, &$refused): JsonResponse {
                try {
                    return $work();
                } catch (Throwable $e) {
                    $refused = $this->storageError($e);

                    throw $e;
                }
            });
        } catch (Throwable $e) {
            $refused ??= $this->storageError($e);
            if ($refused === null) {
                throw $e;
            }

            // Not the message: a QueryException's carries the SQL with the
            // photo's bytes bound into it.
            Log::error('The database refused to store an uploaded photo.', [
                'mysqlError' => $refused,
                'exception' => $e::class,
            ]);

            return ApiError::json(507, 'image_storage_full', 'The database has no room for this photo.');
        } finally {
            $this->releaseUploads();
        }
    }

    private function libraryFull(): JsonResponse
    {
        return ApiError::json(409, 'image_library_full', 'The image library is full. Delete an image first.');
    }

    private function alreadyInLibrary(): JsonResponse
    {
        return ApiError::json(409, 'image_already_in_library', 'Another image in the library is already this photo.');
    }

    /**
     * GET_LOCK, as App\Http\Middleware\RunPendingMigrations takes its own: the
     * lock belongs to the connection, so it is taken on the write PDO the
     * transaction uses. It returns 1 when acquired, 0 on timeout and NULL on
     * error.
     */
    private function lockUploads(): bool
    {
        $row = DB::selectOne(
            'SELECT GET_LOCK(?, ?) AS acquired',
            [self::UPLOAD_LOCK, (int) config('api.images.upload_lock_timeout')],
            useReadPdo: false,
        );

        return $row !== null && (string) $row->acquired === '1';
    }

    /** Best effort: the server releases it anyway when the connection closes. */
    private function releaseUploads(): void
    {
        try {
            DB::selectOne('SELECT RELEASE_LOCK(?)', [self::UPLOAD_LOCK], useReadPdo: false);
        } catch (Throwable) {
            // Throwing here would replace whatever the upload itself raised.
        }
    }

    /**
     * MySQL's error number when it means the database cannot take the bytes,
     * or null when the failure is something else and should stay a 500.
     *
     * 1114 is a full table, and 1021 and 1030 (the storage engine's "error
     * 28") a full disk. 1153 is a packet over max_allowed_packet, which the
     * host sets and nobody here can raise. 1142 is a refused command: shared
     * hosts that enforce a database quota take INSERT away from the account
     * once it is over, rather than failing the write itself. The code may sit
     * on a previous exception, so the chain is read.
     */
    private function storageError(Throwable $e): ?int
    {
        for ($cause = $e; $cause !== null; $cause = $cause->getPrevious()) {
            $code = $cause instanceof PDOException ? ($cause->errorInfo[1] ?? null) : null;

            if (in_array($code, [1021, 1030, 1114, 1142, 1153], true)) {
                return $code;
            }
        }

        return null;
    }
}
