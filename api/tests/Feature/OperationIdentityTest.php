<?php

namespace Tests\Feature;

use PHPUnit\Framework\TestCase;

/**
 * How an operation names itself, and how a group explains itself.
 *
 * NEITHER IS COSMETIC. An operationId is what orval turns into the hook name a
 * screen imports, so it is the client's vocabulary — `useMemberRoleReplace`
 * rather than `useMemberRole`. And a group with no description is a heading in
 * the reference's sidebar with nothing under it, which is where a developer
 * decides whether the section they are looking at is the one they want.
 *
 * Nine operations carried a class-derived name until 2026-09-11, because an
 * invokable controller has no method for Scramble to build one from. All seven
 * groups were bare.
 */
class OperationIdentityTest extends TestCase
{
    private const DOCUMENT = __DIR__.'/../../openapi.json';

    /** @var array<string, mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $document = json_decode((string) file_get_contents(self::DOCUMENT), true);

        self::assertIsArray($document, 'api/openapi.json did not parse; every assertion below would be vacuous.');

        $this->document = $document;
    }

    public function test_every_operation_is_named_resource_then_action(): void
    {
        $wrong = [];
        $seen = 0;

        foreach ($this->operations() as $where => $operation) {
            $seen++;
            $id = $operation['operationId'] ?? null;

            // camelCase either side of one dot. `memberAttendance.destroy` and
            // `registrationOption.replace` are the shape; `guestListExport` and
            // `MemberRoleController` are not.
            if (! is_string($id) || preg_match('/^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/', $id) !== 1) {
                $wrong[] = "{$where}: ".var_export($id, true);
            }
        }

        self::assertGreaterThan(25, $seen, 'Found almost no operations; this test is reading the wrong thing.');

        self::assertSame([], $wrong, sprintf(
            "These operations are not named `resource.action`:\n  - %s\n\n"
            .'An invokable controller gives Scramble no method name to build one from, so it '
            ."falls back to the class. Add #[Endpoint(operationId: '…')].",
            implode("\n  - ", $wrong)
        ));
    }

    public function test_no_two_operations_answer_to_the_same_name(): void
    {
        $ids = [];

        foreach ($this->operations() as $operation) {
            $ids[] = $operation['operationId'] ?? null;
        }

        self::assertSame(array_unique($ids), $ids, 'Two operations share an operationId, so one client function would overwrite the other.');
    }

    public function test_every_group_says_what_it_is(): void
    {
        $tags = $this->document['tags'] ?? [];

        self::assertNotEmpty($tags, 'The document declares no tags at all.');

        $bare = [];

        foreach ($tags as $tag) {
            if (trim((string) ($tag['description'] ?? '')) === '') {
                $bare[] = $tag['name'] ?? '(unnamed)';
            }
        }

        self::assertSame([], $bare, sprintf(
            "These groups have no description: %s.\n"
            .'Exactly one controller per group carries it — Scramble keeps whichever #[Group] '
            .'has one, and repeating it at every controller in a group is copies waiting to disagree.',
            implode(', ', $bare)
        ));
    }

    /**
     * @return iterable<string, array<string, mixed>>
     */
    private function operations(): iterable
    {
        foreach ($this->document['paths'] as $path => $item) {
            foreach ($item as $method => $operation) {
                if (! in_array($method, ['get', 'post', 'put', 'patch', 'delete'], true)) {
                    continue;
                }

                yield strtoupper($method).' '.$path => $operation;
            }
        }
    }
}
