<?php

namespace App\Support;

/**
 * The complete set of permissions the API knows.
 *
 * Three of them (`events.view`, `attendance.respond`, `account.manage`) are
 * seeded ahead of their middleware and are enforced from #191; until then
 * Member::isPlayer() still decides who may answer an event.
 *
 * THIS IS CODE, NOT DATA, and that is the whole point. A permission is real
 * only if some middleware checks it, so the set cannot be invented in an admin
 * UI — roles (which are data) merely group these.
 *
 * Answering an event IS a permission (`attendance.respond`), held through the
 * `musician` role rather than derived from a register (from #191; today
 * Member::isPlayer() still derives it). A register only groups and displays;
 * it never grants anything (ADR 0014). An organiser who does not
 * play simply does not hold `musician`, and one who does (`demo.both`) holds
 * both roles: that pair is what breaks if anyone brings an either/or back.
 */
enum Permission: string
{
    case EventsManage = 'events.manage';
    case AttendanceViewAll = 'attendance.view_all';
    case AttendanceRecordForOthers = 'attendance.record_for_others';
    case MembersManage = 'members.manage';
    case RegistrationsView = 'registrations.view';

    /**
     * Editing or cancelling somebody's booking, as opposed to reading the
     * guest list.
     *
     * A separate case from RegistrationsView on purpose: guests get no
     * self-service (ADR 0020), so the committee corrects mistakes — but
     * `committee` holds RegistrationsView as its only permission, and widening
     * that token would hand the role that merely looks at the list the power to
     * delete from it.
     */
    case RegistrationsManage = 'registrations.manage';

    /**
     * Reading the committee inbox, and the messages the public has sent.
     *
     * `committee` holds this as its second permission: a prestation enquiry is
     * committee business, and somebody has to be able to read one.
     */
    case MessagesView = 'messages.view';

    /**
     * Marking a message handled, reopening it, and deleting it.
     *
     * SEPARATE FROM MessagesView for the same reason RegistrationsManage is
     * separate from RegistrationsView: the token that merely looks must not
     * carry the power to destroy. Binning a stranger's message is direction's
     * call, and `committee` deliberately does not hold this.
     */
    case MessagesManage = 'messages.manage';

    /**
     * Adding, correcting and deleting the entries of the band's history.
     *
     * Granted to `direction` by migration. Not to `committee`, whose role is
     * reading what the public sends, not publishing on the band's behalf.
     */
    case HistoryManage = 'history.manage';

    /**
     * Reading the planning: the event list and a single event.
     *
     * Held by the baseline `member` role, so every account has it. NOTHING
     * CHECKS THIS YET: it is seeded ahead of the route middleware so a server
     * carries the data before the code that requires it ships (#191).
     */
    case EventsView = 'events.view';

    /**
     * Answering for oneself: PUT and DELETE /events/{event}/attendance.
     *
     * Held by `musician`. Recording an answer FOR SOMEBODY ELSE is
     * AttendanceRecordForOthers and is unrelated. Not yet checked (#191).
     */
    case AttendanceRespond = 'attendance.respond';

    /**
     * Managing one's own account: POST /me/password.
     *
     * Held by the baseline `member` role. Not yet checked (#191).
     */
    case AccountManage = 'account.manage';
}
