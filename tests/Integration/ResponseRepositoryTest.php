<?php

use App\Repositories\ResponseRepository;

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
        $repo->record(7, 1, 'participate'); // id 7 = sam.beispiel (see 02-seed.sql)

        $entry = $this->responseFor($repo->allForEvent(1, ['user', 'moderator']), 'sam.beispiel');

        $this->assertSame('participate', $entry['response']);
    }

    public function testRecordUpsertsExistingResponse(): void
    {
        // demo.user (id 1) already has 'participate' for event 1 in the seed data.
        $repo = new ResponseRepository($this->db);
        $repo->record(1, 1, 'notparticipate');

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

    public function testAllForEventOrdersRespondersBeforeNonResponders(): void
    {
        $repo = new ResponseRepository($this->db);
        $repo->record(7, 1, 'participate'); // sam.beispiel — no prior response for event 1

        $usernames = array_column($repo->allForEvent(1, ['user', 'moderator']), 'username');
        $demoUserIndex = array_search('demo.user', $usernames, true); // has a seeded response
        $samIndex = array_search('sam.beispiel', $usernames, true); // just responded above
        $noResponseIndex = array_search('demo.user3', $usernames, true); // no response for event 1 in seed data

        $this->assertLessThan($noResponseIndex, $demoUserIndex);
        $this->assertLessThan($noResponseIndex, $samIndex);
    }
}
