<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreHistoryEntryRequest;
use App\Http\Resources\HistoryEntryResource;
use App\Models\HistoryEntry;
use App\Support\Audit;
use App\Support\Emits;
use App\Support\HistoryPrecision;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

#[Group('History', 'The band\'s history, one dated entry at a time. Reading it is public; changing it needs `history.manage`.', weight: 60)]
class HistoryEntryController extends Controller
{
    /** Every entry, oldest first. Public. */
    #[Endpoint(operationId: 'historyEntry.index')]
    public function index(): AnonymousResourceCollection
    {
        return HistoryEntryResource::collection(
            HistoryEntry::query()->orderBy('occurred_on')->orderBy('id')->get(),
        );
    }

    /** One entry, with the `ETag` its update and delete must quote. Requires `history.manage`. */
    #[Endpoint(operationId: 'historyEntry.show')]
    public function show(HistoryEntry $historyEntry): HistoryEntryResource
    {
        return new HistoryEntryResource($historyEntry);
    }

    /** Requires `history.manage`. Answers `201` with the created entry. */
    #[Endpoint(operationId: 'historyEntry.store')]
    #[Emits('history_entry_empty')]
    public function store(StoreHistoryEntryRequest $request): JsonResponse
    {
        if ($request->isEmpty()) {
            return $this->empty();
        }

        $entry = HistoryEntry::create($this->columns($request));
        Audit::record($request->user(), 'history.created', 'history_entry', $entry->id, $this->label($entry));

        return response()->json(new HistoryEntryResource($entry), 201);
    }

    /** Replaces the entry. Requires `history.manage` and the `If-Match` from its read. */
    #[Endpoint(operationId: 'historyEntry.update')]
    #[Emits('history_entry_empty')]
    #[Response(200, 'The entry as it now stands.')]
    public function update(StoreHistoryEntryRequest $request, HistoryEntry $historyEntry): JsonResponse
    {
        if ($request->isEmpty()) {
            return $this->empty();
        }

        $historyEntry->fill($this->columns($request))->save();
        Audit::record($request->user(), 'history.updated', 'history_entry', $historyEntry->id, $this->label($historyEntry));

        return response()->json(new HistoryEntryResource($historyEntry));
    }

    /** Requires `history.manage` and the `If-Match` from its read. */
    #[Endpoint(operationId: 'historyEntry.destroy')]
    #[Response(200, 'Deleted.')]
    public function destroy(Request $request, HistoryEntry $historyEntry): JsonResponse
    {
        $id = $historyEntry->id;
        $label = $this->label($historyEntry);
        $historyEntry->delete();
        Audit::record($request->user(), 'history.deleted', 'history_entry', $id, $label);

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function columns(StoreHistoryEntryRequest $request): array
    {
        $data = $request->validated();
        $precision = HistoryPrecision::from($data['precision']);

        return [
            'occurred_on' => $precision->truncate(CarbonImmutable::parse($data['occurredOn']))->toDateString(),
            'precision' => $precision->value,
            'title_fr' => $data['titleFr'],
            'body_fr' => $data['bodyFr'],
            'title_de' => $data['titleDe'],
            'body_de' => $data['bodyDe'],
            'important' => (bool) $data['important'],
            'icon' => $data['icon'] ?? null,
        ];
    }

    private function label(HistoryEntry $entry): string
    {
        $text = $entry->title_fr ?? $entry->title_de ?? $entry->body_fr ?? $entry->body_de ?? '';

        return mb_substr($text, 0, 80);
    }

    private function empty(): JsonResponse
    {
        return ApiError::json(422, 'history_entry_empty', 'A history entry needs a title or a text, in French or German.');
    }
}
