<?php

namespace App\Support;

use Carbon\CarbonInterface;
use JsonSerializable;
use Stringable;

/**
 * A moment as this API renders it: ISO 8601, UTC, with an explicit offset.
 *
 * It has two jobs. The first is calling `->utc()` before
 * `->toIso8601String()`, an order that is load-bearing: `toIso8601String()`
 * renders in whatever timezone the Carbon instance carries, which is not
 * always what the database holds. App\Casts\UtcDateTime normalises on read,
 * but a model whose attribute was just assigned keeps the instance it was
 * given, and Eloquent's class-cast cache hands that same object back. POST
 * /api/v1/events/series builds its times as Europe/Zurich wall-clock, so
 * without the conversion its 201 would render `+01:00` where a GET of the same
 * row renders `+00:00`.
 *
 * The second job is the contract, and is why this is an object. A timestamp
 * rendered as a bare PHP string cannot be told from a title, so response
 * schemas would lack the `format: date-time` that request schemas carry.
 * Returning this type gives App\Support\Scramble\Iso8601ToSchema something to
 * recognise.
 *
 * It is JsonSerializable, so the bytes on the wire are the same string.
 */
final class Iso8601 implements JsonSerializable, Stringable
{
    private function __construct(private readonly string $rendered) {}

    public static function utc(CarbonInterface $moment): self
    {
        return new self($moment->utc()->toIso8601String());
    }

    public function jsonSerialize(): string
    {
        return $this->rendered;
    }

    public function __toString(): string
    {
        return $this->rendered;
    }
}
