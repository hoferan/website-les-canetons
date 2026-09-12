<?php

namespace App\Support;

use Attribute;

/**
 * The failures an action raises that nothing in the route table implies.
 *
 * App\Support\Scramble\DocumentsFailureModes derives almost everything from a
 * route's own middleware — `permission:` IS the reason a 403 exists, so reading
 * it means the document cannot drift from the routes, and there is no
 * annotation to forget. That is the property A3 was built for and this does not
 * weaken it.
 *
 * WHAT IT CANNOT REACH is the refusals a controller or a domain service raises:
 * `registration_closed` comes out of a date comparison,
 * `cannot_remove_last_administrator` out of a count. Nothing about the route
 * says so, and no inference is going to find it. A3's own docblock says these
 * "need an attribute on the action — annotation is right there, because the
 * fact really is per-action". This is that attribute.
 *
 * #[Emits('registration_not_open', 'registration_closed')]
 *
 * The status comes from App\Support\ErrorVocabulary, so an action names WHAT it
 * refuses and never which number carries it — one fact in one place, and a code
 * whose status changes moves every declaration with it.
 *
 * NOT A LICENCE TO ANNOTATE WHAT CAN BE DERIVED. A code listed here that the
 * middleware already implies is redundant, and the union that builds the
 * response would silently swallow it. Add middleware if the middleware is the
 * truth.
 *
 * Tests\Feature\EmittedCodesTest checks every name here against the vocabulary
 * and against the exported document, so a typo and an extension that has
 * stopped running both fail rather than going quiet.
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
