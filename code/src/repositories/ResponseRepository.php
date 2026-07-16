<?php

// This buildless app wires classes together with plain `require` includes (see
// bootstrap.php) rather than namespaced autoloading, so this class intentionally
// stays in the global namespace. Namespacing it would mean also updating every
// unqualified reference across code/**.php — out of scope for a formatting-only
// PSR-12 pass with no test coverage to verify the refactor.
// phpcs:ignore PSR1.Classes.ClassDeclaration.MissingNamespace
final class ResponseRepository
{
    public function __construct(private mysqli $db)
    {
    }

    /** Record (or change) a user's answer for an event. Upsert on (user, event). */
    public function record(string $username, int $eventId, string $answer): void
    {
        $sql = "INSERT INTO responses (user_id, event_id, answer)
                VALUES ((SELECT id FROM users WHERE username = ?), ?, ?)
                ON DUPLICATE KEY UPDATE answer = VALUES(answer)";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('sis', $username, $eventId, $answer);
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
        $sql = "SELECT u.username AS username, i.name AS instrument,
                   (SELECT r.answer FROM responses r
                    WHERE r.user_id = u.id AND r.event_id = ? LIMIT 1) AS response
                FROM users u
                LEFT JOIN instruments i ON u.instrument_id = i.id
                WHERE u.role IN ($placeholders)
                ORDER BY COALESCE(
                    (SELECT r.answer FROM responses r
                     WHERE r.user_id = u.id AND r.event_id = ? LIMIT 1), ''
                ) DESC, u.username";
        $stmt = $this->db->prepare($sql);
        // Bind order follows placeholder order: eventId (SELECT), roles (WHERE), eventId (ORDER BY).
        $types = 'i' . str_repeat('s', count($respondingRoles)) . 'i';
        $params = array_merge([$eventId], $respondingRoles, [$eventId]);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }
}
