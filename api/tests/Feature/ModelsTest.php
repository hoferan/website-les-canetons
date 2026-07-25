<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Signup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_signup_casts_menus_to_an_array(): void
    {
        $signup = Signup::create([
            'occasion' => 'anniversary-supper',
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'address' => 'Rue du Test 1',
            'phone' => '0790000000',
            'email' => 'ada@example.com',
            'table_name' => 'Table 1',
            'menus' => ['meat', 'child'],
        ]);

        $this->assertSame(['meat', 'child'], $signup->fresh()->menus);
    }

    public function test_event_exposes_the_frontend_shape(): void
    {
        $event = Event::create([
            'date' => '2027-11-13',
            'title' => 'Repetition',
            'start_time' => '20:00:00',
            'end_time' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 1,
        ]);

        $this->assertSame([
            'id' => $event->id,
            'date' => '2027-11-13',
            'title' => 'Repetition',
            'startTime' => '20:00:00',
            'endTime' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 1,
            'response' => null,
        ], $event->toFrontendShape());
    }
}
