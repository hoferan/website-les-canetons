<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEventTagRequest;
use App\Http\Resources\EventTagResource;
use App\Models\EventTag;
use App\Support\Audit;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('Event tags', 'The labels events carry, such as "Répétition" or "Carnaval". Any member reads them; changing them needs `events.manage`.', weight: 41)]
class EventTagController extends Controller
{
    /** Every tag, in the committee's order, with how many events carry each. Requires `events.view`. */
    #[Endpoint(operationId: 'eventTag.index')]
    public function index(): AnonymousResourceCollection
    {
        return EventTagResource::collection(
            EventTag::query()->withCount('events')->orderBy('sort_order')->orderBy('id')->get(),
        );
    }

    /** One tag, with the `ETag` its update and delete must quote. Requires `events.manage`. */
    #[Endpoint(operationId: 'eventTag.show')]
    public function show(EventTag $eventTag): EventTagResource
    {
        return new EventTagResource($eventTag->loadCount('events'));
    }

    /** Requires `events.manage`. The new tag goes last. Answers `201` with it. */
    #[Endpoint(operationId: 'eventTag.store')]
    public function store(StoreEventTagRequest $request): JsonResponse
    {
        $tag = EventTag::create($this->columns($request) + [
            'sort_order' => (int) EventTag::query()->max('sort_order') + 1,
        ]);
        Audit::record($request->user(), 'event_tag.created', 'event_tag', $tag->id, $tag->label_fr);

        return response()->json(new EventTagResource($tag->loadCount('events')), 201);
    }

    /** Replaces the tag's names, colour and confetti flag. Requires `events.manage` and the `If-Match` from its read. */
    #[Endpoint(operationId: 'eventTag.update')]
    #[Response(200, 'The tag as it now stands.')]
    public function update(StoreEventTagRequest $request, EventTag $eventTag): JsonResponse
    {
        $eventTag->fill($this->columns($request))->save();
        Audit::record($request->user(), 'event_tag.updated', 'event_tag', $eventTag->id, $eventTag->label_fr);

        return response()->json(new EventTagResource($eventTag->loadCount('events')));
    }

    /** Takes the tag off every event that carries it. Requires `events.manage` and the `If-Match` from its read. */
    #[Endpoint(operationId: 'eventTag.destroy')]
    #[Response(200, 'Deleted.')]
    public function destroy(Request $request, EventTag $eventTag): JsonResponse
    {
        $id = $eventTag->id;
        $label = $eventTag->label_fr;
        $eventTag->delete();
        Audit::record($request->user(), 'event_tag.deleted', 'event_tag', $id, $label);

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function columns(StoreEventTagRequest $request): array
    {
        $data = $request->validated();

        return [
            'label_fr' => $data['labelFr'],
            'label_de' => $data['labelDe'],
            'colour' => $data['colour'],
            'celebrate' => $data['celebrate'],
        ];
    }
}
