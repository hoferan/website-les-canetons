<?php

namespace Tests\Feature;

use App\Support\ErrorVocabulary;
use PHPUnit\Framework\TestCase;

/**
 * Every failure this API can answer with is declared by the operation that can
 * answer with it.
 *
 * A shared component per status (`Problem409`) carrying one `code` is right
 * only while that status has one cause. `POST /events/{event}/registrations`
 * answers 409 with `idempotency_key_reuse`, `registration_not_open` or
 * `registration_closed`; a generated client narrowing on a one-code union is
 * short by two, and TypeScript tells it those branches cannot happen.
 *
 * Under-stating is the failure that matters. Declaring a code an operation
 * cannot emit costs a reader a dead branch; omitting one it can emit lets a
 * client mishandle a real answer with the compiler's approval.
 *
 * A plain PHPUnit TestCase: it reads two files and needs no booted framework.
 * The per-operation half is Tests\Feature\EmittedCodesTest, which needs the
 * route table.
 */
class DeclaredCodesTest extends TestCase
{
    private const DOCUMENT = __DIR__.'/../../openapi.json';

    /**
     * Codes that belong to no operation, with the reason each one does not.
     *
     * Short on purpose: every entry is a claim that has to stay true, and a
     * growing exemption list turns a completeness test into a formality.
     */
    private const NOT_AN_OPERATIONS_ANSWER = [
        // 405 is the path's answer: it happens for a method that has no
        // operation. Declaring it on `GET /events` would say that operation can
        // answer 405. A reader meets it in the reference's status table.
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

        // A floor: a scan that stopped matching (a renamed schema key, a
        // changed component shape) would otherwise report a clean contract.
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
     * Every `code` value named anywhere in the document. It walks the whole
     * document, since a code reaches a reader through a shared component or an
     * inline response, and scanning one would call the other missing.
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
