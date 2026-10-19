<?php

namespace Tests\Feature;

use App\Models\CommitteeFunction;
use App\Models\Member;
use App\Models\Section;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * The two people-pages of the public site, generated from the roster.
 *
 * These tests guard consent. `public_visible` defaults to false because most of
 * the band are children, and these are the only two endpoints that serve a
 * member's name to somebody with no session. The assertions about who is
 * listed are a promise made to a parent.
 *
 * A migration seeds the six registers as reference data and RefreshDatabase
 * runs it, so these tests use them. Creating `Batteurs` again collides with the
 * unique index, and indexing the answer by position reads whichever register
 * sorts first.
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

        // assertSame on values: key presence alone stays green when two fields
        // are swapped in the Resource.
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
     * A register everybody has withheld consent for is still rendered, empty.
     * Dropping it would tell a visitor the band has no drummers, and would let
     * a reader infer that a named child withheld consent.
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

    public function test_a_register_carries_no_photo(): void
    {
        // A register's photo is a photo slot like any other, read from
        // /photo-slots by the page; the band read knows nothing of it.
        $register = $this->register('Cloches');
        $this->placePhoto("register-{$register->id}", LibraryImage::create()->id);

        $this->assertArrayNotHasKey('photo', $this->registerIn($this->getJson('/api/v1/band'), 'Cloches'));
    }

    public function test_it_orders_registers_the_way_the_band_configured_them(): void
    {
        $response = $this->getJson('/api/v1/band')->assertStatus(200);

        // By sort_order, so the order lives in the table and nowhere else.
        $this->assertSame(
            self::SEEDED_REGISTERS,
            array_column($response->json('data'), 'name'),
        );
    }

    /**
     * An instructor teaches one register and may play in another, so the two
     * columns are separate and the same person under two headings is correct.
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
     * Nothing about an account is published. MemberResource carries the
     * username, the last login, the roles and the consent flag; this endpoint
     * shares none of it because PublicMemberResource does not write them.
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
        // The name, not the id. A seat is content the committee types, so the
        // public page renders it verbatim and no translation layer reaches it.
        $this->assertSame('Responsable caisse', $response->json('data.0.function'));
        // A seat shows no portrait: the committee page is names and seats.
        $this->assertArrayNotHasKey('photo', $response->json('data.0'));
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
        // A foreign key has one way to say "no seat": null.
        Member::factory()->create(['committee_function_id' => null, 'public_visible' => true]);

        $this->assertSame([], $this->getJson('/api/v1/committee')->json('data'));
    }

    public function test_the_committee_is_ordered_by_rank(): void
    {
        // The reason for the reference table. Alphabetically both columns sort
        // the wrong way round (Aebischer before Zbinden, "Responsable caisse"
        // before "Présidente"), so only ordering by rank passes.
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
        // determine the order. Without the tie-break the cards would come back
        // in whatever order the database chose.
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
     * One register out of the answer, by name. The six seeded registers all
     * come back, so `data.0` is Batteurs whatever the test is about.
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
