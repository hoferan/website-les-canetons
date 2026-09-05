<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class HashingTest extends TestCase
{
    public function test_this_php_build_supports_argon2id(): void
    {
        $this->assertTrue(
            defined('PASSWORD_ARGON2ID'),
            'This PHP build has no argon2 support. Set HASH_DRIVER=bcrypt for '.
            'this environment and record why in the deploy notes.',
        );
    }

    public function test_the_default_driver_is_argon2id(): void
    {
        $this->assertSame('argon2id', config('hashing.driver'));
    }

    public function test_a_hash_round_trips(): void
    {
        $hash = Hash::make('correct horse battery staple');

        $this->assertStringStartsWith('$argon2id$', $hash);
        $this->assertTrue(Hash::check('correct horse battery staple', $hash));
        $this->assertFalse(Hash::check('wrong', $hash));
    }
}
