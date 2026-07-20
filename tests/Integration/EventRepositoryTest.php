<?php

use App\Repositories\EventRepository;

final class EventRepositoryTest extends IntegrationTestCase
{
    private function eventById(array $events, int $id): ?array
    {
        foreach ($events as $event) {
            if ($event['id'] === $id) {
                return $event;
            }
        }
        return null;
    }

    public function testCreateThenAllForUserIncludesNewEvent(): void
    {
        $repo = new EventRepository($this->db);
        $repo->create([
            'date'      => '2026-12-24',
            'title'     => 'Test Event',
            'startTime' => '18:00:00',
            'endTime'   => '20:00:00',
            'location'  => 'Fribourg',
            'attire'    => 'Uniforme',
            'weekend'   => 0,
        ]);

        $titles = array_column($repo->allForUser('demo.user'), 'title');

        $this->assertContains('Test Event', $titles);
    }

    public function testAllForUserAnnotatesExistingResponse(): void
    {
        $repo = new EventRepository($this->db);

        $event = $this->eventById($repo->allForUser('demo.user'), 1);

        $this->assertSame('participate', $event['response']);
    }

    public function testAllForUserResponseIsNullWhenNoAnswer(): void
    {
        $repo = new EventRepository($this->db);

        $event = $this->eventById($repo->allForUser('sam.beispiel'), 1);

        $this->assertNull($event['response']);
    }

    public function testUpdateChangesFields(): void
    {
        $repo = new EventRepository($this->db);
        $repo->update([
            'id'        => 1,
            'date'      => '2026-08-23',
            'title'     => 'Répétition modifiée',
            'startTime' => '11:00:00',
            'endTime'   => '13:00:00',
            'location'  => 'Werkhof',
            'attire'    => 'Libre',
            'weekend'   => 0,
        ]);

        $event = $this->eventById($repo->all(), 1);

        $this->assertSame('Répétition modifiée', $event['title']);
        $this->assertSame('11:00:00', $event['startTime']);
    }

    public function testDeleteRemovesEvent(): void
    {
        $repo = new EventRepository($this->db);
        $repo->delete(2);

        $ids = array_column($repo->all(), 'id');

        $this->assertNotContains(2, $ids);
    }

    public function testUpdateWithoutWeekendKeyPreservesExistingWeekendFlag(): void
    {
        $repo = new EventRepository($this->db);
        $repo->update([
            'id'        => 1,
            'date'      => '2026-08-23',
            'title'     => 'Répétition modifiée',
            'startTime' => '11:00:00',
            'endTime'   => '13:00:00',
            'location'  => 'Werkhof',
            'attire'    => 'Libre',
            'weekend'   => 1,
        ]);

        // Second update omits 'weekend' entirely — it must stay 1, not reset to 0.
        $repo->update([
            'id'        => 1,
            'date'      => '2026-08-23',
            'title'     => 'Répétition modifiée à nouveau',
            'startTime' => '11:00:00',
            'endTime'   => '13:00:00',
            'location'  => 'Werkhof',
            'attire'    => 'Libre',
        ]);

        $event = $this->eventById($repo->all(), 1);
        $this->assertSame(1, $event['weekend']);
    }

    public function testUpdateWithExplicitFalsyWeekendOverridesExistingValue(): void
    {
        $repo = new EventRepository($this->db);
        $repo->update([
            'id'        => 1,
            'date'      => '2026-08-23',
            'title'     => 'Répétition modifiée',
            'startTime' => '11:00:00',
            'endTime'   => '13:00:00',
            'location'  => 'Werkhof',
            'attire'    => 'Libre',
            'weekend'   => 1,
        ]);

        // Second update EXPLICITLY sets weekend to 0 — it must become 0, not stay 1.
        $repo->update([
            'id'        => 1,
            'date'      => '2026-08-23',
            'title'     => 'Répétition modifiée à nouveau',
            'startTime' => '11:00:00',
            'endTime'   => '13:00:00',
            'location'  => 'Werkhof',
            'attire'    => 'Libre',
            'weekend'   => 0,
        ]);

        $event = $this->eventById($repo->all(), 1);
        $this->assertSame(0, $event['weekend']);
    }

    public function testExistsReturnsTrueForKnownEvent(): void
    {
        $repo = new EventRepository($this->db);
        $this->assertTrue($repo->exists(1));
    }

    public function testExistsReturnsFalseForUnknownEvent(): void
    {
        $repo = new EventRepository($this->db);
        $this->assertFalse($repo->exists(999999));
    }
}
