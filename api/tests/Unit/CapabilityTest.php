<?php

namespace Tests\Unit;

use App\Support\Capability;
use PHPUnit\Framework\TestCase;

class CapabilityTest extends TestCase
{
    public function test_user_can_respond(): void
    {
        $this->assertTrue(Capability::can('user', 'respond'));
    }

    public function test_moderator_can_respond(): void
    {
        $this->assertTrue(Capability::can('moderator', 'respond'));
    }

    public function test_admin_cannot_respond(): void
    {
        $this->assertFalse(Capability::can('admin', 'respond'));
    }

    public function test_admin_can_manage_events(): void
    {
        $this->assertTrue(Capability::can('admin', 'manage_events'));
    }

    public function test_admin_can_view_summary(): void
    {
        $this->assertTrue(Capability::can('admin', 'view_summary'));
    }

    public function test_user_cannot_manage_events(): void
    {
        $this->assertFalse(Capability::can('user', 'manage_events'));
    }

    public function test_unknown_role_has_no_capabilities(): void
    {
        $this->assertFalse(Capability::can(null, 'respond'));
        $this->assertFalse(Capability::can('nonexistent', 'respond'));
    }

    public function test_roles_with_respond(): void
    {
        $this->assertEqualsCanonicalizing(['user', 'moderator'], Capability::rolesWith('respond'));
    }

    public function test_roles_with_manage_events(): void
    {
        $this->assertEqualsCanonicalizing(['admin'], Capability::rolesWith('manage_events'));
    }
}
