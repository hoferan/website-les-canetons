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

    public function test_answering_for_oneself_is_a_permission(): void
    {
        $values = array_column(Permission::cases(), 'value');

        $this->assertContains('attendance.respond', $values);
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
                'registrations.manage',
                'messages.view',
                'messages.manage',
                'history.manage',
                'images.manage',
                'events.view',
                'attendance.respond',
                'account.manage',
            ],
            array_column(Permission::cases(), 'value'),
        );
    }
}
