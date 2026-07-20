<?php

namespace App\Repositories;

use mysqli;

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
        $id = (int) $e['id'];
        $weekend = array_key_exists('weekend', $e) ? (int) $e['weekend'] : $this->currentWeekend($id);
        $sql = "UPDATE events SET date=?, title=?, start_time=?, end_time=?,
                location=?, attire=?, weekend=? WHERE id=?";
        $stmt = $this->db->prepare($sql);
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

    /** The event's current 'weekend' flag, or 0 if the event doesn't exist. */
    private function currentWeekend(int $id): int
    {
        $stmt = $this->db->prepare('SELECT weekend FROM events WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ? (int) $row['weekend'] : 0;
    }

    public function exists(int $id): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM events WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $found = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        return $found;
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
