<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateBlockRequest;
use App\Http\Resources\ContentBlockResource;
use App\Models\ContentBlock;
use App\Support\Audit;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The content blocks the band has changed (#106). The SPA ships every default;
 * this holds only what differs, as one JSON object per block.
 */
#[Group('Content', "The public pages' content blocks the band has changed, by block key. Reading them is public; changing one needs `content.manage`.", weight: 66)]
class ContentBlockController extends Controller
{
    /**
     * Every changed block, by key. Public.
     *
     * A key that is absent shows the page's default content.
     */
    #[Endpoint(operationId: 'block.index')]
    public function index(): AnonymousResourceCollection
    {
        return ContentBlockResource::collection(ContentBlock::query()->orderBy('key')->get());
    }

    /**
     * Changes one block, or puts it back. Requires `content.manage`.
     *
     * `{key}` is the block's name: a lower-case word, then up to three more
     * dot-separated segments of lower-case letters, digits and hyphens, at
     * most 64 characters. `data` is an object of at most six levels, with
     * lists of at most 24 items, strings of at most 2000 characters, keys of
     * a letter then letters and digits (32 at most), and 64 KB once encoded;
     * null puts the default back. A string may be empty, which means
     * nothing is shown there. No `If-Match`: the write sets one block, and
     * the last save is what the page shows, with both in the audit log.
     */
    #[Endpoint(operationId: 'block.update')]
    #[Response(200, 'The block as stored, or null when the page is back to its default.')]
    public function update(UpdateBlockRequest $request, string $key): JsonResponse
    {
        // The route's pattern cannot bound the length, so the column's limit
        // answers like any other key the pattern refuses.
        abort_if(strlen($key) > ContentBlock::MAX_KEY_LENGTH, 404);

        $data = $request->blockData();

        if ($data === null) {
            ContentBlock::query()->whereKey($key)->delete();
            $block = null;
        } else {
            // An upsert, so two first saves of one block arriving at once are
            // settled by the key instead of one of them failing.
            ContentBlock::query()->upsert(
                [['key' => $key, 'data' => json_encode($data), 'created_at' => now(), 'updated_at' => now()]],
                ['key'],
                ['data', 'updated_at'],
            );
            $block = ContentBlock::query()->findOrFail($key);
        }

        Audit::record($request->user(), $block === null ? 'block.reset' : 'block.changed', 'content_block', null, $key);

        return response()->json([
            'block' => $block === null ? null : new ContentBlockResource($block),
        ]);
    }
}
