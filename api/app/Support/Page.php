<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * How much of a collection one response carries, and how to ask for the rest.
 *
 * Offset-based — `?limit=` and `?offset=` — because every set in this system is
 * one page forever: ~45 members, a season of ~30 events, a few hundred bookings
 * at a sold-out souper. A cursor pays for itself on large or shifting sets and
 * costs an opaque token on every other one. Adding `?cursor=` later does not
 * break the envelope, which is the reason to start with the envelope rather
 * than with the cursor.
 *
 * THE DEFAULT IS ABOVE EVERY REAL COLLECTION, ON PURPOSE. A client that sends
 * no parameters gets the whole thing, so nothing in the SPA has to implement
 * paging for a list that will never have a second page. The cap is what stops
 * `?limit=100000` from asking a shared host to build a response out of every
 * row it owns; it is not a policy about how clients should behave.
 *
 * NOTHING HERE REFUSES. A `limit` above the cap is clamped, a negative `offset`
 * is read as zero, and `?limit=soon` is read as no limit at all — the same
 * fail-safe direction EventController takes with `?past=`, where anything but
 * the magic word means "show me the planning". These parameters are a hint
 * about how much to send, never a claim the server has to adjudicate, and
 * `meta` reports exactly what was applied, so a client that sent nonsense can
 * see that it did. Refusing would put a 400 on every collection in the contract
 * for the sake of a typo nobody can act on.
 */
final class Page
{
    /**
     * Above every collection this system will hold for years, so the SPA sees
     * one page and never has to page.
     */
    public const DEFAULT_LIMIT = 500;

    /**
     * The most rows one response may carry: a bound on what a single request
     * can ask this host to render.
     */
    public const MAX_LIMIT = 1000;

    private function __construct(
        public readonly int $limit,
        public readonly int $offset,
    ) {}

    /** The page this request asked for, clamped to what the API will serve. */
    public static function from(Request $request): self
    {
        return new self(
            self::clamp($request->query('limit'), self::DEFAULT_LIMIT, 1, self::MAX_LIMIT),
            self::clamp($request->query('offset'), 0, 0, PHP_INT_MAX),
        );
    }

    /**
     * One query parameter as a whole number inside its bounds.
     *
     * A value that is not a whole number — absent, empty, `abc`, `2.5`, an
     * array from `?limit[]=` — is the default. `filter_var` with
     * FILTER_VALIDATE_INT rather than `is_numeric` or a cast, because a cast
     * reads "2.5" as 2 and "abc" as 0, and 0 is a limit that would answer every
     * collection with nothing.
     */
    private static function clamp(mixed $value, int $default, int $min, int $max): int
    {
        if (! is_string($value) && ! is_int($value)) {
            return $default;
        }

        $parsed = filter_var($value, FILTER_VALIDATE_INT);

        if ($parsed === false) {
            return $default;
        }

        return max($min, min($max, $parsed));
    }

    /**
     * This page's rows out of the whole collection.
     *
     * @param  list<mixed>  $rows
     * @return list<mixed>
     */
    public function slice(array $rows): array
    {
        // array_slice reindexes without preserve_keys, so the result is a list
        // already — an array_values() around it is what PHPStan calls out.
        return array_slice($rows, $this->offset, $this->limit);
    }

    /**
     * What the client needs to know about the page it just got.
     *
     * `total` is the whole collection, not this page — it is what lets a screen
     * write "45 membres" without counting an array that may have been cut off.
     * `limit` and `offset` are what was APPLIED, which is not always what was
     * asked for: see the note on this class.
     *
     * @return array{total: int, limit: int, offset: int}
     */
    public function meta(int $total): array
    {
        return ['total' => $total, 'limit' => $this->limit, 'offset' => $this->offset];
    }

    /**
     * The RFC 8288 `Link` header for this page: `first`, `prev`, `next`, `last`.
     *
     * `prev` is absent on the first page and `next` on the last, so a client can
     * walk the collection by following `next` until there is none rather than by
     * doing arithmetic on `meta`. `first` and `last` are always present, even
     * when they are this page: a header that omits them on a single-page
     * collection would make "is there more?" a different question depending on
     * the answer.
     *
     * Every other query parameter is preserved, which is what keeps
     * `/events?past=1` paging through the past rather than silently jumping to
     * the planning on page two.
     */
    public function links(Request $request, int $total): string
    {
        $last = $total === 0 ? 0 : intdiv($total - 1, $this->limit) * $this->limit;

        $links = ['first' => 0];

        if ($this->offset > 0) {
            $links['prev'] = max(0, $this->offset - $this->limit);
        }

        if ($this->offset + $this->limit < $total) {
            $links['next'] = $this->offset + $this->limit;
        }

        $links['last'] = $last;

        $header = [];

        foreach ($links as $rel => $offset) {
            $header[] = '<'.$this->url($request, $offset).'>; rel="'.$rel.'"';
        }

        return implode(', ', $header);
    }

    /** This collection's URL at one offset, carrying the request's own filters. */
    private function url(Request $request, int $offset): string
    {
        $query = $request->query();
        $query['limit'] = (string) $this->limit;
        $query['offset'] = (string) $offset;

        // ksort so the exported document and the tests read the same header
        // whatever order the caller happened to send its parameters in.
        ksort($query);

        return $request->url().'?'.http_build_query($query);
    }
}
