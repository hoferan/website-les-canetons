<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * This project is API-only (no `/` web route), so the basic smoke test
     * targets Laravel's built-in health endpoint instead of the removed
     * welcome page.
     */
    public function test_the_health_check_returns_a_successful_response(): void
    {
        $response = $this->get('/up');

        $response->assertStatus(200);
    }
}
