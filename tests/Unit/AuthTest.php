<?php

use App\Auth;
use PHPUnit\Framework\TestCase;

final class AuthTest extends TestCase
{
    public function testUserCanRespondButNotManage(): void
    {
        $this->assertTrue(Auth::roleCan('user', 'respond'));
        $this->assertFalse(Auth::roleCan('user', 'manage_events'));
        $this->assertFalse(Auth::roleCan('user', 'view_summary'));
    }

    public function testModeratorCanRespondButNotManage(): void
    {
        $this->assertTrue(Auth::roleCan('moderator', 'respond'));
        $this->assertFalse(Auth::roleCan('moderator', 'manage_events'));
    }

    public function testAdminCanManageButNotRespond(): void
    {
        $this->assertTrue(Auth::roleCan('admin', 'manage_events'));
        $this->assertTrue(Auth::roleCan('admin', 'view_summary'));
        $this->assertFalse(Auth::roleCan('admin', 'respond'));
    }

    public function testUnknownOrNullRoleHasNoCapabilities(): void
    {
        $this->assertFalse(Auth::roleCan('nope', 'respond'));
        $this->assertFalse(Auth::roleCan(null, 'respond'));
    }

    public function testRolesWithCapability(): void
    {
        $this->assertSame(['user', 'moderator'], Auth::rolesWithCapability('respond'));
        $this->assertSame(['admin'], Auth::rolesWithCapability('manage_events'));
        $this->assertSame(['admin'], Auth::rolesWithCapability('view_summary'));
    }
}
