/**
 * The permissions behind the inbox's sources, any one of which gives it
 * something to show: `messages.view` for the public's messages,
 * `registrations.view` for events whose bookings moved (#123).
 *
 * Mirrors the sources in App\Support\Inbox\InboxRegistry. The route guard and
 * the nav entry both read this, so they cannot disagree about who has an inbox.
 */
export const INBOX_PERMISSIONS = ["messages.view", "registrations.view"] as const;
