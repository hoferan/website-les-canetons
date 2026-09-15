<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContactMessageResource;
use App\Models\ContactMessage;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Committee inbox', 'The messages the public has sent, and whether anybody has dealt with them.', weight: 45)]
class ContactMessageController extends Controller
{
    /**
     * List the messages the public has sent.
     *
     * Newest first. `?handled=0` returns only what is still open — the same
     * set the inbox shows — and `?handled=1` only what has been dealt with.
     * Omit the parameter for everything.
     *
     * Paginated: read `data` for the rows and `meta.total` for the count.
     */
    #[Endpoint(operationId: 'contactMessage.index')]
    public function index(Request $request): AnonymousResourceCollection
    {
        $messages = ContactMessage::query()
            ->with('handledBy')
            // Newest first, with the id as a tiebreaker: created_at has
            // one-second resolution here, and two messages sent in the same
            // second would otherwise page unstably.
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->when($request->has('handled'), fn ($query) => $request->boolean('handled')
                ? $query->whereNotNull('handled_at')
                : $query->whereNull('handled_at'))
            ->get();

        return ContactMessageResource::collection($messages);
    }

    /**
     * Read one message.
     *
     * This is the read that hands out the `ETag` the two writes below require:
     * a collection hands out none. A screen reads the message as it opens it
     * and writes with that read's tag, never a fresher one.
     */
    #[Endpoint(operationId: 'contactMessage.show')]
    public function show(ContactMessage $contactMessage): ContactMessageResource
    {
        return new ContactMessageResource($contactMessage->load('handledBy'));
    }
}
