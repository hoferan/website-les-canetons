<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\InboxItemResource;
use App\Support\Inbox\InboxRegistry;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Committee inbox', 'The messages the public has sent, and whether anybody has dealt with them.', weight: 45)]
class InboxController extends Controller
{
    public function __construct(private readonly InboxRegistry $registry) {}

    /**
     * Everything open that you may act on.
     *
     * Newest first across every kind. Filtered by permission rather than
     * refused: a member who may act on nothing gets an empty list, so this is
     * safe to call for anybody with a session.
     */
    #[Endpoint(operationId: 'inbox.index')]
    public function index(Request $request): AnonymousResourceCollection
    {
        return InboxItemResource::collection($this->registry->openFor($request->user()));
    }

    /**
     * How much is waiting, for the nav badge.
     *
     * Deliberately not a list, so it is not enveloped: this is called on
     * navigation and should stay as small as an answer can be.
     *
     * @return array{total: int, counts: array<string, int>}
     */
    // @phpstan-ignore return.phpDocType (the @return above is Scramble's, not PHP's — it steers the OpenAPI schema so `counts` types as a map of integers instead of a string)
    #[Response(200, 'How many items are open, in total and by kind. Counts only what the caller may act on, so a member with none of the relevant permissions sees zero rather than a refusal.')]
    #[Endpoint(operationId: 'inbox.summary')]
    public function summary(Request $request): JsonResponse
    {
        $counts = $this->registry->countsFor($request->user());

        return response()->json([
            /** Open items across every kind you may act on. */
            'total' => array_sum($counts),
            /** The same, broken down by kind. Absent kinds are ones you may not see. */
            'counts' => (object) $counts,
        ]);
    }
}
