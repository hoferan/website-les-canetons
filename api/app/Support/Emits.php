<?php

namespace App\Support;

use Attribute;

/**
 * The failures an action raises that nothing in the route table implies.
 *
 * App\Support\Scramble\DocumentsFailureModes derives most failures from a
 * route's own middleware (`permission:` is the reason a 403 exists), so the
 * document cannot drift from the routes. It cannot reach the refusals a
 * controller or a domain service raises: `registration_closed` comes out of a
 * date comparison, `cannot_remove_last_administrator` out of a count. Those
 * are per-action facts, so the action declares them with this attribute:
 *
 * #[Emits('registration_not_open', 'registration_closed')]
 *
 * The status comes from App\Support\ErrorVocabulary, so an action names what
 * it refuses and never which status carries it, and a code whose status
 * changes moves every declaration with it.
 *
 * Do not list a code the middleware already implies: it is redundant, and the
 * union that builds the response would silently swallow it. Add middleware if
 * the middleware is the truth.
 *
 * Tests\Feature\EmittedCodesTest checks every name here against the
 * vocabulary and against the exported document, so a typo and an extension
 * that has stopped running both fail.
 */
#[Attribute(Attribute::TARGET_METHOD)]
final class Emits
{
    /** @var list<string> */
    public readonly array $codes;

    public function __construct(string ...$codes)
    {
        $this->codes = array_values($codes);
    }
}
