<?php

namespace Tests\Unit;

use App\Support\Permission;
use PHPUnit\Framework\TestCase;

class PermissionTest extends TestCase
{
    public function test_every_permission_uses_dotted_lowercase_naming(): void
    {
        foreach (Permission::cases() as $permission) {
            $this->assertMatchesRegularExpression(
                '/^[a-z_]+\.[a-z_]+$/',
                $permission->value,
                "Permission {$permission->name} does not follow area.action naming",
            );
        }
    }

    public function test_responding_is_not_a_permission(): void
    {
        // Answering for yourself is what a member IS, not something granted.
        // A `respond` permission would reintroduce the bug where an organiser
        // could not record their own attendance.
        $values = array_column(Permission::cases(), 'value');

        $this->assertNotContains('attendance.respond', $values);
        $this->assertNotContains('respond', $values);
    }

    public function test_the_expected_permissions_exist(): void
    {
        $this->assertSame(
            [
                'events.manage',
                'attendance.view_all',
                'attendance.record_for_others',
                'members.manage',
                'registrations.view',
            ],
            array_column(Permission::cases(), 'value'),
        );
    }
}
