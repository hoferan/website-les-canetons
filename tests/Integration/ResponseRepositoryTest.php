<?php

final class ResponseRepositoryTest extends IntegrationTestCase
{
    private function responseFor(array $summary, string $username): ?array
    {
        foreach ($summary as $row) {
            if ($row['username'] === $username) {
                return $row;
            }
        }
        return null;
    }

    public function testRecordInsertsNewResponse(): void
    {
        $repo = new ResponseRepository($this->db);
        $repo->record('sam.beispiel', 1, 'participate');

        $entry = $this->responseFor($repo->allForEvent(1, ['user', 'moderator']), 'sam.beispiel');

        $this->assertSame('participate', $entry['response']);
    }

    public function testRecordUpsertsExistingResponse(): void
    {
        // demo.user already has 'participate' for event 1 in the seed data.
        $repo = new ResponseRepository($this->db);
        $repo->record('demo.user', 1, 'notparticipate');

        $entry = $this->responseFor($repo->allForEvent(1, ['user', 'moderator']), 'demo.user');

        $this->assertSame('notparticipate', $entry['response']);
    }

    public function testAllForEventExcludesNonRespondingRoles(): void
    {
        $repo = new ResponseRepository($this->db);

        $usernames = array_column($repo->allForEvent(1, ['user', 'moderator']), 'username');

        $this->assertNotContains('demo.admin', $usernames);
    }

    public function testAllForEventReturnsEmptyForNoRespondingRoles(): void
    {
        $repo = new ResponseRepository($this->db);

        $this->assertSame([], $repo->allForEvent(1, []));
    }
}
