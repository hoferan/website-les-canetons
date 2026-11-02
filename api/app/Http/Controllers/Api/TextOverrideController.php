<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateTextRequest;
use App\Http\Resources\TextOverrideResource;
use App\Models\TextOverride;
use App\Support\Audit;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The public texts the band has changed (#106). The SPA's catalogue holds
 * every default; this holds only what differs, keyed by catalogue path.
 */
#[Group('Texts', 'The public pages\' texts the band has changed, by catalogue key. Reading them is public; changing one needs `content.manage`.', weight: 66)]
class TextOverrideController extends Controller
{
    /**
     * Every changed text, by key. Public.
     *
     * A key that is absent shows the page's default wording.
     */
    #[Endpoint(operationId: 'text.index')]
    public function index(): AnonymousResourceCollection
    {
        return TextOverrideResource::collection(TextOverride::query()->orderBy('key')->get());
    }

    /**
     * Changes one text, or puts it back. Requires `content.manage`.
     *
     * `{key}` is the text's path in the SPA's catalogue: two to eight
     * dot-separated segments of letters and digits, at most 128 characters.
     * Send both languages; null or blank in both puts the default back. No
     * `If-Match`: the write sets one text, and the last save is what the page
     * shows, with both in the audit log.
     */
    #[Endpoint(operationId: 'text.update')]
    #[Response(200, 'The text as stored, or null when the page is back to its default.')]
    public function update(UpdateTextRequest $request, string $key): JsonResponse
    {
        // The route's pattern cannot bound the length, so the column's limit
        // answers like any other key the pattern refuses.
        abort_if(strlen($key) > TextOverride::MAX_KEY_LENGTH, 404);

        $fr = $request->fr();
        $de = $request->de();

        if ($fr === null && $de === null) {
            TextOverride::query()->whereKey($key)->delete();
            $text = null;
        } else {
            // An upsert, so two first saves of one text arriving at once are
            // settled by the key instead of one of them failing.
            TextOverride::query()->upsert(
                [['key' => $key, 'fr' => $fr, 'de' => $de, 'created_at' => now(), 'updated_at' => now()]],
                ['key'],
                ['fr', 'de', 'updated_at'],
            );
            $text = TextOverride::query()->findOrFail($key);
        }

        Audit::record($request->user(), $text === null ? 'text.reset' : 'text.changed', 'text', null, $key);

        return response()->json([
            'text' => $text === null ? null : new TextOverrideResource($text),
        ]);
    }
}
