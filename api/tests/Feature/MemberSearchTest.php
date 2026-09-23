<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Searching the roster (#97): `?q=`, `?section=` and `?role=` on GET /members.
 *
 * ON THE SERVER, NOT OVER THE ROWS A SCREEN HAPPENS TO HOLD. The collection
 * envelope slices on the server, so a filter that ran in the browser would
 * search page one of a cut-short roster and miss everybody else without
 * saying so. Here the query narrows first and the envelope slices what is
 * left, so `meta.total` counts the matches. See
 * docs/superpowers/specs/2026-09-23-roster-and-planning-search-design.md.
 */
class MemberSearchTest extends TestCase
{
    use RefreshDatabase;

    private Member $admin;

    protected function setUp(): void
    {
        parent::setUp();

        // No section: Dominique organises and plays nothing, which is what
        // makes `section=none` find somebody.
        $this->admin = Member::factory()->named('Dominique', 'Direction', 'demo.direction')->administrator()->create();
    }

    /** @return list<string> the last names the roster answered with, in order */
    private function search(string $query): array
    {
        $body = $this->actingAsMember($this->admin)
            ->getJson('/api/v1/members?'.$query)
            ->assertOk()
            ->json();

        $this->assertSame(count($body['data']), $body['meta']['total'], 'meta.total counts the matches, not the roster');

        return array_column($body['data'], 'lastName');
    }

    public function test_q_matches_a_first_name_a_last_name_or_a_username(): void
    {
        Member::factory()->named('Perrine', 'Player', 'demo.player')->create();
        Member::factory()->named('Bastien', 'Both', 'b.both')->create();

        $this->assertSame(['Player'], $this->search('q=perr'));
        $this->assertSame(['Both'], $this->search('q=both'));
        $this->assertSame(['Player'], $this->search('q=demo.pl'));
    }

    public function test_q_matches_the_whole_name_in_either_order(): void
    {
        Member::factory()->named('Perrine', 'Player')->create();

        // What somebody types when they are looking for a person: the name as
        // they would say it, or as the roster sorts it.
        $this->assertSame(['Player'], $this->search('q='.rawurlencode('perrine pl')));
        $this->assertSame(['Player'], $this->search('q='.rawurlencode('player perr')));
    }

    public function test_q_ignores_case_and_accents(): void
    {
        Member::factory()->named('Hélène', 'Dürrenmatt')->create();

        // Free from the connection collation, utf8mb4_unicode_ci. A phone
        // keyboard makes the accent the hard half to type.
        $this->assertSame(['Dürrenmatt'], $this->search('q=HELENE'));
        $this->assertSame(['Dürrenmatt'], $this->search('q=durren'));
    }

    public function test_q_is_trimmed_and_an_empty_one_is_no_filter(): void
    {
        Member::factory()->named('Perrine', 'Player')->create();

        $this->assertSame(['Direction', 'Player'], $this->search('q='));
        $this->assertSame(['Direction', 'Player'], $this->search('q='.rawurlencode('   ')));
        $this->assertSame(['Player'], $this->search('q='.rawurlencode('  perrine  ')));
    }

    public function test_like_wildcards_in_q_are_literal(): void
    {
        Member::factory()->named('Perrine', 'Player')->create();
        Member::factory()->named('Anne', 'Under_score')->create();

        // Unescaped, `%` matches everybody and `_` matches any character.
        $this->assertSame([], $this->search('q='.rawurlencode('%')));
        $this->assertSame(['Under_score'], $this->search('q='.rawurlencode('r_s')));
        $this->assertSame([], $this->search('q='.rawurlencode('\\')));
    }

    public function test_section_filters_by_register(): void
    {
        Member::factory()->named('Perrine', 'Player')->inSection('Cloches')->create();
        Member::factory()->named('Tom', 'Trumpet')->inSection('Trompettes')->create();

        $cloches = Section::where('name', 'Cloches')->sole();

        $this->assertSame(['Player'], $this->search('section='.$cloches->id));
    }

    public function test_section_none_finds_the_members_in_no_register(): void
    {
        Member::factory()->named('Perrine', 'Player')->inSection('Cloches')->create();

        $this->assertSame(['Direction'], $this->search('section=none'));
    }

    public function test_role_filters_by_role(): void
    {
        Member::factory()->named('Camille', 'Committee')->committee()->create();
        Member::factory()->named('Perrine', 'Player')->create();

        $committee = Role::where('key', 'committee')->sole();

        $this->assertSame(['Committee'], $this->search('role='.$committee->id));
    }

    public function test_filters_combine(): void
    {
        Member::factory()->named('Bastien', 'Both')->inSection('Trompettes')->administrator()->create();
        Member::factory()->named('Tom', 'Trumpet')->inSection('Trompettes')->create();

        $trompettes = Section::where('name', 'Trompettes')->sole();
        $direction = Role::where('key', 'direction')->sole();

        $this->assertSame(['Both'], $this->search("section={$trompettes->id}&role={$direction->id}"));
        $this->assertSame([], $this->search("section={$trompettes->id}&role={$direction->id}&q=tom"));
    }

    public function test_an_id_naming_nothing_is_an_empty_list_not_an_error(): void
    {
        // A select left open while somebody deletes the register it offered
        // is a filter that matches nobody, not a broken screen.
        $this->assertSame([], $this->search('section=999999'));
        $this->assertSame([], $this->search('role=999999'));
    }

    /** @return iterable<string, array{string, string, string}> */
    public static function malformed(): iterable
    {
        yield 'a section that is neither an id nor none' => ['section=abc', 'section', 'invalid_format'];
        yield 'a fractional role' => ['role=1.5', 'role', 'invalid_type'];
        yield 'an over-long q' => ['q='.str_repeat('a', 101), 'q', 'too_long'];
    }

    #[DataProvider('malformed')]
    public function test_a_malformed_filter_is_refused_with_its_reason(string $query, string $field, string $reason): void
    {
        $this->actingAsMember($this->admin)
            ->getJson('/api/v1/members?'.$query)
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', $field)
            ->assertJsonPath('errors.0.reason', $reason);
    }
}
