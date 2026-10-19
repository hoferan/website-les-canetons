<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use Database\Factories\MemberFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * A register grants nothing (#191, ADR 0014): these routes answer 403
 * access_denied to an account whose roles lack the permission. Each refused
 * account below has a register, which shows the register does not decide.
 */
class PermissionOnlyAccessTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();
        $this->event = Event::factory()->create();
    }

    /**
     * The routes the baseline role opens, with a body valid for each.
     *
     * @return array<string, array{string, string, array<string, string>}>
     */
    public static function baselineRoutes(): array
    {
        $password = ['currentPassword' => MemberFactory::PASSWORD, 'newPassword' => 'a-brand-new-one'];

        return [
            'the planning' => ['get', '/api/v1/events', []],
            'one event' => ['get', '/api/v1/events/{event}', []],
            'the event tags' => ['get', '/api/v1/event-tags', []],
            'changing one\'s own password' => ['post', '/api/v1/me/password', $password],
        ];
    }

    /** @param array<string, string> $body */
    #[DataProvider('baselineRoutes')]
    public function test_a_baseline_route_refuses_a_player_without_the_baseline(string $method, string $path, array $body): void
    {
        // Plays, answers, and holds everything but the baseline role.
        $player = Member::factory()->inSection('Cloches')->musician()->withoutBaseline()->create();

        $this->actingAsMember($player)
            ->json($method, $this->path($path), $body)
            ->assertStatus(403)
            ->assertJsonPath('code', 'access_denied');
    }

    /** @param array<string, string> $body */
    #[DataProvider('baselineRoutes')]
    public function test_a_baseline_route_lets_the_baseline_through_without_a_register(string $method, string $path, array $body): void
    {
        $nobody = Member::factory()->create();

        $this->actingAsMember($nobody)
            ->json($method, $this->path($path), $body)
            ->assertOk();
    }

    public function test_a_register_without_attendance_respond_cannot_answer(): void
    {
        $member = Member::factory()->inSection('Cloches')->create();

        $this->actingAsMember($member)
            ->putJson($this->attendance(), ['status' => 'yes'])
            ->assertStatus(403)
            ->assertJsonPath('code', 'access_denied');
        $this->actingAsMember($member)
            ->deleteJson($this->attendance())
            ->assertStatus(403)
            ->assertJsonPath('code', 'access_denied');

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_attendance_respond_without_a_register_may_answer(): void
    {
        $member = Member::factory()->musician()->create();

        $this->actingAsMember($member)
            ->putJson($this->attendance(), ['status' => 'yes'])
            ->assertOk();
        $this->actingAsMember($member)
            ->deleteJson($this->attendance())
            ->assertOk();
    }

    public function test_an_organiser_who_does_not_play_is_still_refused(): void
    {
        // demo.direction: direction and the baseline, no register, no
        // musician. The missing permission refuses her at the door.
        $organiser = Member::factory()->administrator()->create();

        $this->actingAsMember($organiser)
            ->putJson($this->attendance(), ['status' => 'yes'])
            ->assertStatus(403)
            ->assertJsonPath('code', 'access_denied');
    }

    public function test_an_organiser_who_plays_still_answers_and_manages(): void
    {
        // demo.both: the case an either/or role model breaks.
        $both = Member::factory()->inSection('Trompettes')->musician()->administrator()->create();

        $this->actingAsMember($both)
            ->putJson($this->attendance(), ['status' => 'yes'])
            ->assertOk();
        $this->actingAsMember($both)
            ->getJson("/api/v1/events/{$this->event->id}/attendance")
            ->assertOk()
            ->assertJsonPath('data.0.memberId', $both->id);
    }

    private function path(string $template): string
    {
        return str_replace('{event}', (string) $this->event->id, $template);
    }

    private function attendance(): string
    {
        return "/api/v1/events/{$this->event->id}/attendance";
    }
}
