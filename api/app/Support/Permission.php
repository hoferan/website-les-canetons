<?php

namespace App\Support;

/**
 * The complete set of permissions the API enforces.
 *
 * THIS IS CODE, NOT DATA, and that is the whole point. A permission is real
 * only if some middleware checks it, so the set cannot be invented in an admin
 * UI — roles (which are data) merely group these.
 *
 * There is deliberately NO permission for answering an event. A member answers
 * for themselves when they belong to a register (Member::isPlayer()); making it
 * a grant is what produced the old bug where an admin could not say whether
 * they were coming, and left "Pas de réponse" counts meaningless.
 */
enum Permission: string
{
    case EventsManage = 'events.manage';
    case AttendanceViewAll = 'attendance.view_all';
    case AttendanceRecordForOthers = 'attendance.record_for_others';
    case MembersManage = 'members.manage';
    case RegistrationsView = 'registrations.view';
}
