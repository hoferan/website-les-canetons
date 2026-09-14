<?php

namespace Tests\Feature;

use App\Support\ErrorVocabulary;
use PHPUnit\Framework\TestCase;

/**
 * Every failure this API can answer with is declared by the operation that can
 * answer with it.
 *
 * THE GAP THIS CLOSES. A3 declared failures by attaching a SHARED component per
 * status — `Problem401`, `Problem409` — each carrying exactly one `code` in its
 * enum. That was right while every declared failure was derived from middleware,
 * because a middleware-derived failure has exactly one cause. It stopped being
 * right the moment a second cause appeared for a status: on 2026-09-12
 * `POST /events/{event}/registrations` declared a 409 whose enum named only
 * `idempotency_key_reuse`, while the controller also answers 409
 * `registration_not_open` and `registration_closed`. A generated client
 * narrowing on that union is short by two, and TypeScript tells it the branches
 * cannot happen.
 *
 * Under-stating is the failure that matters. Declaring a code an operation
 * cannot emit costs a reader a branch they will never take; omitting one they
 * CAN emit is a client that mishandles a real answer with the compiler's
 * blessing.
 *
 * A plain PHPUnit TestCase — it reads two files and needs no booted framework.
 * The per-operation half lives in Tests\Feature\EmittedCodesTest, which needs
 * the route table.
 */
class DeclaredCodesTest extends TestCase
{
    private const DOCUMENT = __DIR__.'/../../openapi.json';

    /**
     * Codes that belong to no operation, with the reason each one does not.
     *
     * SHORT ON PURPOSE, and every entry is a claim that has to keep being true.
     * An exemption list is how a completeness test quietly stops being one.
     */
    private const NOT_AN_OPERATIONS_ANSWER = [
        // 405 is the PATH's answer, not an operation's: it happens when a
        // caller uses a method for which there IS no operation. Declaring it on
        // `GET /events` would say that operation can answer 405, which it
        // cannot. The reference's status table is where a reader meets it.
        'method_not_allowed',
    ];

    /** @var array<string, mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $document = json_decode((string) file_get_contents(self::DOCUMENT), true);

        self::assertIsArray($document, 'api/openapi.json did not parse; every assertion below would be vacuous.');

        $this->document = $document;
    }

    public function test_every_code_the_api_can_emit_is_declared_by_some_operation(): void
    {
        $declared = $this->declaredCodes();

        // The floor. A scan that stopped matching — a renamed schema key, a
        // changed component shape — would otherwise report a clean contract it
        // never read.
        self::assertGreaterThan(
            20,
            count($declared),
            'Found almost no declared codes; this test is reading the document wrong.'
        );

        $missing = array_values(array_diff(
            ErrorVocabulary::codes(),
            $declared,
            self::NOT_AN_OPERATIONS_ANSWER,
        ));

        self::assertSame([], $missing, sprintf(
            "These codes are emitted by the API and declared by no operation:\n  - %s\n\n"
            .'A client generated from this document has no branch for them. Add the code to the '
            .'operation that raises it — #[Emits(...)] on the action — or, if it really belongs to '
            .'no operation, to this test\'s exemption list with the reason.',
            implode("\n  - ", $missing)
        ));
    }

    public function test_no_operation_declares_a_code_that_does_not_exist(): void
    {
        $unknown = array_values(array_diff($this->declaredCodes(), ErrorVocabulary::codes()));

        self::assertSame([], $unknown, sprintf(
            'The document declares codes the API cannot emit: %s. Either a typo, or a code that '
            .'was removed from App\Support\ErrorVocabulary and left behind here.',
            implode(', ', $unknown)
        ));
    }

    /**
     * Every `code` value named anywhere in the document, from the shared
     * components and from the inline responses alike.
     *
     * Walks the whole document rather than the paths, because a code reaches a
     * reader through either half and a scan of one would call the other
     * missing.
     *
     * @return list<string>
     */
    private function declaredCodes(): array
    {
        $found = [];

        $walk = function (mixed $node) use (&$walk, &$found): void {
            if (! is_array($node)) {
                return;
            }

            // A problem document's `code` property, wherever it sits: a shared
            // component, an inline response, a $ref target.
            if (isset($node['code']['enum']) && is_array($node['code']['enum'])) {
                foreach ($node['code']['enum'] as $code) {
                    $found[] = (string) $code;
                }
            }

            foreach ($node as $child) {
                $walk($child);
            }
        };

        $walk($this->document);

        $unique = array_values(array_unique($found));
        sort($unique);

        return $unique;
    }
}
