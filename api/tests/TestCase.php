<?php

namespace Tests;

use App\Models\Member;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Acts as a member the way a real browser does.
     *
     * BOTH EXTRAS ARE REQUIRED, and neither is obvious:
     *
     *   - the `Origin` header makes Sanctum treat this as a request from a
     *     stateful frontend, which is what attaches a session store to it at
     *     all;
     *   - `auth.started_at` satisfies EnforceAbsoluteSessionLifetime, which
     *     fails closed on a session it cannot date.
     *
     * Get either wrong and the request answers 401, which reads as a broken
     * endpoint rather than a broken test. That three-line incantation was
     * copy-pasted into ten test files and twenty-four call sites before it
     * moved here.
     */
    protected function actingAsMember(Member $member): static
    {
        return $this->actingAs($member)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp]);
    }
}
