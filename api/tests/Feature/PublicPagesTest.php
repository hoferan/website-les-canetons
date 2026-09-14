<?php

namespace Tests\Feature;

use App\Models\CommitteeFunction;
use App\Models\Member;
use App\Models\Section;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * The two people-pages of the public site, generated from the roster.
 *
 * WHAT THESE TESTS ARE REALLY GUARDING is consent. `public_visible` defaults
 * to false because most of the band are children, and these are the only two
 * endpoints in the system that serve a member's name to somebody with no
 * session at all. The assertions about shape are ordinary; the ones about who
 * is listed are a promise made to a parent.
 *
 * THE SIX REGISTERS ARE ALREADY THERE. `2026_09_07_000001` seeds them as
 * reference data and RefreshDatabase runs every migration, so a fresh database
 * has Batteurs through Trombones before a single line of a test runs. These
 * tests therefore use those rather than inventing registers of their own — a
 * `Section::factory()->create(['name' => 'Batteurs'])` collides with the
 * unique index, and indexing the answer by position reads whichever seeded
 * register sorts first.
 */
class PublicPagesTest extends TestCase
{
    use RefreshDatabase;

    /** The six the reference-data migration seeds, in the order it seeds them. */
    private const SEEDED_REGISTERS = [
        'Batteurs',
        'Grosses-caisses',
        'Lyre',
        'Cloches',
        'Trompettes',
        'Trombones',
    ];

    public function test_the_band_is_readable_without_a_session(): void
    {
        $this->getJson('/api/v1/band')->assertStatus(200);
    }

    public function test_the_committee_is_readable_without_a_session(): void
    {
        $this->getJson('/api/v1/committee')->assertStatus(200);
    }

    public function test_it_lists_a_consenting_player_under_their_register(): void
    {
        Member::factory()->create([
            'first_name' => 'Perrine',
            'last_name' => 'Player',
            'section_id' => $this->register('Trompettes')->id,
            'public_visible' => true,
        ]);

        $trumpets = $this->registerIn($this->getJson('/api/v1/band'), 'Trompettes');

        // assertSame on VALUES, not assertJsonStructure: key presence alone
        // stays green when two fields are swapped in the Resource.
        $this->assertSame('Perrine', $trumpets['members'][0]['firstName']);
        $this->assertSame('Player', $trumpets['members'][0]['lastName']);
    }

    /** The promise itself. */
    public function test_it_omits_a_player_who_has_not_consented(): void
    {
        Member::factory()->create([
            'first_name' => 'Nadia',
            'section_id' => $this->register('Batteurs')->id,
            'public_visible' => false,
        ]);

        $response = $this->getJson('/api/v1/band');

        $this->assertSame([], $this->registerIn($response, 'Batteurs')['members']);
        $response->assertDontSee('Nadia');
    }

    /**
     * A register everybody has withheld consent for is STILL RENDERED, empty.
     * Dropping it would tell a visitor the band has no drummers, which is a
     * false claim about the band, and it would let a reader infer that a named
     * child withheld consent, which is the one thing this page must not leak.
     */
    public function test_it_keeps_a_register_whose_members_all_withheld_consent(): void
    {
        Member::factory()->create([
            'section_id' => $this->register('Batteurs')->id,
            'public_visible' => false,
        ]);

        $this->assertSame(
            [],
            $this->registerIn($this->getJson('/api/v1/band'), 'Batteurs')['members'],
        );
    }

    public function test_it_orders_registers_the_way_the_band_configured_them(): void
    {
        $response = $this->getJson('/api/v1/band')->assertStatus(200);

        // By sort_order, which is what that column is for: the pre-rebuild front
        // end hardcoded this order in TSX, where it drifted from the table.
        $this->assertSame(
            self::SEEDED_REGISTERS,
            array_column($response->json('data'), 'name'),
        );
    }

    /**
     * An instructor teaches ONE register and may play in ANOTHER. The two
     * columns are separate for that reason, and the same person appearing
     * under two headings is correct rather than a duplicate.
     */
    public function test_an_instructor_is_listed_under_the_register_they_teach(): void
    {
        Member::factory()->create([
            'first_name' => 'Bastien',
            'section_id' => $this->register('Trompettes')->id,
            'instructor_of_section_id' => $this->register('Batteurs')->id,
            'public_visible' => true,
        ]);

        $response = $this->getJson('/api/v1/band');
        $drums = $this->registerIn($response, 'Batteurs');
        $trumpets = $this->registerIn($response, 'Trompettes');

        $this->assertSame('Bastien', $drums['instructors'][0]['firstName']);
        $this->assertSame([], $drums['members']);
        $this->assertSame('Bastien', $trumpets['members'][0]['firstName']);
        $this->assertSame([], $trumpets['instructors']);
    }

    public function test_it_omits_an_instructor_who_has_not_consented(): void
    {
        Member::factory()->create([
            'first_name' => 'Nadia',
            'instructor_of_section_id' => $this->register('Batteurs')->id,
            'public_visible' => false,
        ]);

        $this->assertSame(
            [],
            $this->registerIn($this->getJson('/api/v1/band'), 'Batteurs')['instructors'],
        );
    }

    /**
     * NOTHING ABOUT AN ACCOUNT LEAVES THE BUILDING. MemberResource carries the
     * username, the last login, the roles and the consent flag itself; this
     * endpoint shares none of it, and the protection is that
     * PublicMemberResource does not write those lines.
     */
    public function test_it_publishes_a_name_and_nothing_else(): void
    {
        Member::factory()->create([
            'username' => 'perrine.player.1',
            'section_id' => $this->register('Trompettes')->id,
            'public_visible' => true,
        ]);

        $response = $this->getJson('/api/v1/band');

        $this->assertSame(
            ['id', 'firstName', 'lastName'],
            array_keys($this->registerIn($response, 'Trompettes')['members'][0]),
        );
        $response->assertDontSee('perrine.player.1');
    }

    public function test_the_committee_carries_the_seat_each_person_holds(): void
    {
        Member::factory()->create([
            'first_name' => 'Camille',
            'last_name' => 'Committee',
            'committee_function_id' => $this->seat('Responsable caisse')->id,
            'public_visible' => true,
        ]);

        $response = $this->getJson('/api/v1/committee')->assertStatus(200);

        $this->assertSame('Camille', $response->json('data.0.firstName'));
        // THE NAME, NOT THE ID. A seat is still content — the committee types
        // it — so the public page renders it verbatim and no translation layer
        // reaches it. What changed is who may type it and when, not what a
        // visitor reads.
        $this->assertSame('Responsable caisse', $response->json('data.0.function'));
    }

    public function test_the_committee_omits_somebody_who_has_not_consented(): void
    {
        Member::factory()->create([
            'first_name' => 'Camille',
            'committee_function_id' => $this->seat('Responsable caisse')->id,
            'public_visible' => false,
        ]);

        $this->assertSame([], $this->getJson('/api/v1/committee')->json('data'));
    }

    public function test_the_committee_omits_a_member_holding_no_seat(): void
    {
        // ONE STATE NOW, not three. The free-text column had a member with no
        // seat arriving as null, as '' and as '   ', and the controller carried
        // a trimming filter to tell all three from a real seat. A foreign key
        // has exactly one way to say "nobody".
        Member::factory()->create(['committee_function_id' => null, 'public_visible' => true]);

        $this->assertSame([], $this->getJson('/api/v1/committee')->json('data'));
    }

    public function test_the_committee_is_ordered_by_rank(): void
    {
        // THE POINT OF THE WHOLE REFERENCE TABLE. Alphabetically this is the
        // wrong way round in both columns at once — Aebischer before Zbinden,
        // "Responsable caisse" before "Présidente" — so an ordering that
        // survives this test cannot be either of the two it replaced.
        Member::factory()->create([
            'last_name' => 'Aebischer',
            'committee_function_id' => $this->seat('Responsable caisse')->id,
            'public_visible' => true,
        ]);
        Member::factory()->create([
            'last_name' => 'Zbinden',
            'committee_function_id' => $this->seat('Présidente')->id,
            'public_visible' => true,
        ]);

        $response = $this->getJson('/api/v1/committee')->assertStatus(200);

        $this->assertSame(
            ['Zbinden', 'Aebischer'],
            array_column($response->json('data'), 'lastName'),
        );
    }

    public function test_two_people_sharing_a_seat_are_ordered_by_name(): void
    {
        // "Membre" is held by several people at once, so rank alone does not
        // determine the order. Without the tie-break the two cards would come
        // back in whatever order the database felt like, which changes under
        // them for no reason a reader can see.
        $seat = $this->seat('Membre')->id;

        Member::factory()->create(['last_name' => 'Zbinden', 'committee_function_id' => $seat, 'public_visible' => true]);
        Member::factory()->create(['last_name' => 'Aebischer', 'committee_function_id' => $seat, 'public_visible' => true]);

        $response = $this->getJson('/api/v1/committee')->assertStatus(200);

        $this->assertSame(
            ['Aebischer', 'Zbinden'],
            array_column($response->json('data'), 'lastName'),
        );
    }

    private function seat(string $name): CommitteeFunction
    {
        return CommitteeFunction::where('name', $name)->sole();
    }

    private function register(string $name): Section
    {
        return Section::where('name', $name)->sole();
    }

    /**
     * One register out of the answer, BY NAME rather than by position. The six
     * seeded registers all come back, so `data.0` is Batteurs whatever the test
     * is about — which is how the first draft of this file passed an assertion
     * about trumpets while reading drummers.
     *
     * @return array{name: string, members: list<array<string, mixed>>, instructors: list<array<string, mixed>>}
     */
    private function registerIn(TestResponse $response, string $name): array
    {
        foreach ($response->json('data') as $register) {
            if ($register['name'] === $name) {
                return $register;
            }
        }

        $this->fail("The band page did not list the register {$name}.");
    }
}
