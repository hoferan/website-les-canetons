<?php

namespace Tests\Feature;

use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guards against a regression that Task 1 introduced: deleting the User model
 * left api/config/auth.php's provider still pointed at App\Models\User, so
 * EloquentUserProvider::createModel() does `new App\Models\User` on the first
 * authentication attempt and POST /api/login answers 500 with Laravel's
 * native error body (which also leaks a filesystem path). Task 2 repoints the
 * provider at App\Models\Member; this test is what would have caught the gap.
 *
 * Task 6 replaces this with a fuller LoginTest; this one exists only to keep
 * the 500 from silently coming back in the meantime.
 */
class LoginSmokeTest extends TestCase
{
    use RefreshDatabase;

    public function test_correct_credentials_log_the_member_in(): void
    {
        Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'correct-horse-battery-staple',
        ]);

        $response = $this->withHeaders(['Origin' => 'http://localhost'])
            ->postJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'correct-horse-battery-staple',
            ]);

        $response->assertStatus(200);
        $this->assertAuthenticated();
    }

    public function test_wrong_password_is_rejected_with_the_api_error_contract(): void
    {
        Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'correct-horse-battery-staple',
        ]);

        $response = $this->withHeaders(['Origin' => 'http://localhost'])
            ->postJson('/api/login', [
                'username' => 'lea.keller',
                'password' => 'wrong-password',
            ]);

        $response->assertStatus(401);
        $response->assertJson([
            'code' => 'invalid_credentials',
        ]);
        $response->assertJsonMissing(['exception']);
        $this->assertGuest();
    }
}
