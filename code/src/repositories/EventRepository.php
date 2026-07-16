<?php

// This buildless app wires classes together with plain `require` includes (see
// bootstrap.php) rather than namespaced autoloading, so this class intentionally
// stays in the global namespace. Namespacing it would mean also updating every
// unqualified reference across code/**.php — out of scope for a formatting-only
// PSR-12 pass with no test coverage to verify the refactor.
// phpcs:ignore PSR1.Classes.ClassDeclaration.MissingNamespace
final class EventRepository
{
    public function __construct(private mysqli $db)
    {
    }

    /** All events, each annotated with the given user's response (or null). */
    public function allForUser(string $username): array
    {
        $sql = "SELECT e.id, e.date, e.title, e.start_time, e.end_time, e.location,
                       e.attire, e.weekend, r.answer
                FROM events e
                LEFT JOIN responses r
                  ON r.event_id = e.id
                 AND r.user_id = (SELECT id FROM users WHERE username = ?)
                ORDER BY e.date";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return array_map([self::class, 'shape'], $rows);
    }

    /** All events without any per-user response annotation (public read). */
    public function all(): array
    {
        $sql = "SELECT id, date, title, start_time, end_time, location, attire, weekend
                FROM events ORDER BY date";
        $rows = $this->db->query($sql)->fetch_all(MYSQLI_ASSOC);
        return array_map([self::class, 'shape'], $rows);
    }

    /** Map a DB row to the JSON shape the frontend expects. */
    private static function shape(array $row): array
    {
        return [
            'id'        => (int) $row['id'],
            'date'      => $row['date'],
            'title'     => $row['title'],
            'startTime' => $row['start_time'],
            'endTime'   => $row['end_time'],
            'location'  => $row['location'],
            'attire'    => $row['attire'],
            'weekend'   => (int) $row['weekend'],
            'response'  => ($row['answer'] ?? null) ?: null,
        ];
    }

    public function create(array $e): void
    {
        $sql = "INSERT INTO events (date, title, start_time, end_time, location, attire, weekend)
                VALUES (?, ?, ?, ?, ?, ?, ?)";
        $stmt = $this->db->prepare($sql);
        $weekend = (int) ($e['weekend'] ?? 0);
        $stmt->bind_param(
            'ssssssi',
            $e['date'],
            $e['title'],
            $e['startTime'],
            $e['endTime'],
            $e['location'],
            $e['attire'],
            $weekend
        );
        $stmt->execute();
        $stmt->close();
    }

    public function update(array $e): void
    {
        $sql = "UPDATE events SET date=?, title=?, start_time=?, end_time=?,
                location=?, attire=?, weekend=? WHERE id=?";
        $stmt = $this->db->prepare($sql);
        $weekend = (int) ($e['weekend'] ?? 0);
        $id = (int) $e['id'];
        $stmt->bind_param(
            'ssssssii',
            $e['date'],
            $e['title'],
            $e['startTime'],
            $e['endTime'],
            $e['location'],
            $e['attire'],
            $weekend,
            $id
        );
        $stmt->execute();
        $stmt->close();
    }

    /** Delete an event; its responses go via the FK ON DELETE CASCADE. */
    public function delete(int $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM events WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $stmt->close();
    }
}
