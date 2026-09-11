<?php

namespace App\Support;

use Carbon\CarbonInterface;
use JsonSerializable;
use Stringable;

/**
 * A moment as this API renders it: ISO 8601, UTC, with an explicit offset.
 *
 * TWO JOBS, AND THE SECOND IS WHY IT IS AN OBJECT. The first is the rule every
 * Resource used to repeat by hand — `->utc()` BEFORE `->toIso8601String()`.
 * That order is load-bearing: `toIso8601String()` renders in whatever timezone
 * the Carbon instance happens to carry, which is not always what the database
 * holds. App\Casts\UtcDateTime normalises on READ, but a model whose attribute
 * was just ASSIGNED keeps the instance it was given, and Eloquent's class-cast
 * cache hands that same object back. A black-box review found the consequence
 * on 2026-09-11: POST /api/v1/events/series builds its times as Europe/Zurich
 * wall-clock, so its 201 rendered `+01:00` while a GET of the same row rendered
 * `+00:00` — the same instant, the same declared resource, two spellings. With
 * the conversion here there is no call site left that can get the order wrong.
 *
 * The second job is the contract. Every REQUEST schema carried
 * `format: date-time` and no RESPONSE schema did, because a rendered timestamp
 * left a Resource as a bare PHP string and nothing downstream could tell it
 * from a title. Returning this type instead gives
 * App\Support\Scramble\Iso8601ToSchema something to recognise, and the nine
 * timestamps the API returns gained the format the nine it accepts already had.
 *
 * It is JsonSerializable, so the bytes on the wire are unchanged: the same
 * string, in the same place. Nothing about the response moved.
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
