<?php

namespace App\Repositories;

use mysqli;

final class ResponseRepository
{
    public function __construct(private mysqli $db)
    {
    }

    /** Record (or change) a user's answer for an event. Upsert on (user, event). */
    public function record(int $userId, int $eventId, string $answer): void
    {
        $sql = "INSERT INTO responses (user_id, event_id, answer)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE answer = VALUES(answer)";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('iis', $userId, $eventId, $answer);
        $stmt->execute();
        $stmt->close();
    }

    /**
     * Every eligible user + instrument + their answer for one event (summary).
     * Only users whose role may respond are listed — non-voting roles (e.g. the
     * admin / Team Direction) are excluded so "Pas de réponse" stays meaningful.
     * $respondingRoles comes from Auth::rolesWithCapability('respond').
     */
    public function allForEvent(int $eventId, array $respondingRoles): array
    {
        if ($respondingRoles === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($respondingRoles), '?'));
        $sql = "SELECT u.username AS username, i.name AS instrument, r.answer AS response
                FROM users u
                LEFT JOIN instruments i ON u.instrument_id = i.id
                LEFT JOIN responses r ON r.user_id = u.id AND r.event_id = ?
                WHERE u.role IN ($placeholders)
                ORDER BY COALESCE(r.answer, '') DESC, u.username";
        $stmt = $this->db->prepare($sql);
        // Bind order follows placeholder order: eventId (JOIN), roles (WHERE).
        $types = 'i' . str_repeat('s', count($respondingRoles));
        $params = array_merge([$eventId], $respondingRoles);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }
}
