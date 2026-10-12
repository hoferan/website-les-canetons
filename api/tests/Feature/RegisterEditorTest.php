<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Event;
use App\Models\Member;
use App\Models\PhotoSlot;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * The register editor's API (#276): the register list, its order and both
 * names, kept by whoever holds members.manage.
 */
class RegisterEditorTest extends TestCase
{
    use RefreshDatabase;

    private Member $actor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actor = Member::factory()->administrator()->create();
    }

    private function acting(?Member $as = null): static
    {
        return $this->actingAsMember(($as ?? $this->actor)->fresh());
    }

    private function register(string $name = 'Cloches'): Section
    {
        return Section::query()->where('name', $name)->sole();
    }

    /** @return list<string> */
    private function order(): array
    {
        return Section::query()->orderBy('sort_order')->orderBy('id')->pluck('name')->all();
    }

    // ------------------------------------------------------------- reading

    public function test_the_list_carries_both_names_the_order_and_who_is_in_each(): void
    {
        Member::factory()->inSection('Cloches')->count(2)->create();
        Member::factory()->create(['instructor_of_section_id' => $this->register()->id]);
        $this->register()->update(['name_de' => 'Glocken']);

        $rows = collect($this->acting()->getJson('/api/v1/sections')->assertOk()->json('data'));

        $this->assertSame($this->order(), $rows->pluck('name')->all());
        $cloches = $rows->firstWhere('name', 'Cloches');
        $this->assertSame('Glocken', $cloches['nameDe']);
        $this->assertSame(2, $cloches['playerCount']);
        $this->assertSame(1, $cloches['instructorCount']);
    }

    public function test_the_editor_is_closed_without_members_manage(): void
    {
        $outsider = Member::factory()->withRole(Role::factory()->granting(Permission::EventsManage)->create())->create();
        $register = $this->register();

        $this->acting($outsider)->getJson('/api/v1/sections')->assertStatus(403);
        $this->acting($outsider)->getJson("/api/v1/sections/{$register->id}")->assertStatus(403);
        $this->acting($outsider)->postJson('/api/v1/sections', ['name' => 'Cuivres'])->assertStatus(403);
        $this->acting($outsider)->putJson('/api/v1/sections/order', ['sectionIds' => []])->assertStatus(403);
        $this->acting($outsider)->withHeaders($this->ifMatch('section', $register))
            ->deleteJson("/api/v1/sections/{$register->id}")->assertStatus(403);
    }

    // ------------------------------------------------------------ creating

    public function test_a_new_register_goes_last(): void
    {
        $this->acting()->postJson('/api/v1/sections', ['name' => '  Cuivres ', 'nameDe' => ' '])
            ->assertStatus(201)
            ->assertJsonPath('name', 'Cuivres')
            ->assertJsonPath('nameDe', null)
            ->assertJsonPath('playerCount', 0);

        $this->assertSame('Cuivres', $this->order()[count($this->order()) - 1]);
        $this->assertSame(1, AuditEntry::query()->where('action', 'section.created')->count());
    }

    public function test_two_registers_cannot_share_a_french_name(): void
    {
        $this->acting()->postJson('/api/v1/sections', ['name' => 'Cloches'])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'name')
            ->assertJsonPath('errors.0.reason', 'already_taken');
    }

    // ------------------------------------------------------------ renaming

    public function test_a_rename_replaces_both_names_and_the_photo_follows(): void
    {
        $register = $this->register();
        $image = LibraryImage::create();
        $this->placePhoto("register-{$register->id}", $image->id, 'Cloches', '/band');

        $this->acting()->withHeaders($this->ifMatch('section', $register))
            ->patchJson("/api/v1/sections/{$register->id}", ['name' => 'Clochettes', 'nameDe' => 'Glöckchen'])
            ->assertOk()
            ->assertJsonPath('name', 'Clochettes')
            ->assertJsonPath('nameDe', 'Glöckchen')
            ->assertHeader('ETag');

        $this->assertSame('Clochettes', PhotoSlot::query()->whereKey("register-{$register->id}")->value('label'));
    }

    public function test_a_rename_needs_the_tag_and_is_refused_on_a_stale_one(): void
    {
        $register = $this->register();
        $stale = $this->ifMatch('section', $register);
        $register->update(['name_de' => 'Glocken']);

        $this->acting()->patchJson("/api/v1/sections/{$register->id}", ['name' => 'X'])->assertStatus(428);
        $this->acting()->withHeaders($stale)
            ->patchJson("/api/v1/sections/{$register->id}", ['name' => 'X'])
            ->assertStatus(412);
    }

    public function test_somebody_joining_the_register_does_not_stale_a_rename(): void
    {
        // The counts are out of the tag: a roster edit elsewhere must not
        // refuse a rename that has nothing to do with it.
        $register = $this->register();
        $tag = $this->ifMatch('section', $register);
        Member::factory()->inSection($register)->create();

        $this->acting()->withHeaders($tag)
            ->patchJson("/api/v1/sections/{$register->id}", ['name' => 'Clochettes'])
            ->assertOk();
    }

    // ----------------------------------------------------------- reordering

    public function test_the_whole_order_is_replaced(): void
    {
        $ids = Section::query()->orderBy('sort_order')->pluck('id')->reverse()->values()->all();

        $this->acting()->putJson('/api/v1/sections/order', ['sectionIds' => $ids])
            ->assertOk()
            ->assertJsonPath('data.0.id', $ids[0]);

        $this->assertSame($ids, Section::query()->orderBy('sort_order')->pluck('id')->all());
    }

    public function test_an_order_that_does_not_name_every_register_once_is_refused(): void
    {
        $ids = Section::query()->orderBy('sort_order')->pluck('id')->all();
        $before = $this->order();

        foreach ([array_slice($ids, 1), [...$ids, $ids[0]], [...$ids, 999999]] as $body) {
            $this->acting()->putJson('/api/v1/sections/order', ['sectionIds' => $body])
                ->assertStatus(409)
                ->assertJsonPath('code', 'registers_changed');
        }

        $this->assertSame($before, $this->order());
    }

    // ------------------------------------------------------------- deleting

    public function test_an_empty_register_is_deleted_with_its_photo(): void
    {
        $register = Section::factory()->create(['name' => 'Cuivres']);
        $this->placePhoto("register-{$register->id}", LibraryImage::create()->id, 'Cuivres', '/band');

        $this->acting()->withHeaders($this->ifMatch('section', $register))
            ->deleteJson("/api/v1/sections/{$register->id}")
            ->assertOk();

        $this->assertModelMissing($register);
        $this->assertNull(PhotoSlot::query()->find("register-{$register->id}"));
        $this->assertSame(1, AuditEntry::query()->where('action', 'section.deleted')->count());
    }

    public function test_a_register_somebody_plays_in_or_teaches_is_kept(): void
    {
        $played = $this->register('Cloches');
        Member::factory()->inSection($played)->create();
        $taught = $this->register('Lyre');
        Member::factory()->create(['instructor_of_section_id' => $taught->id]);

        foreach ([$played, $taught] as $register) {
            $this->placePhoto("register-{$register->id}", LibraryImage::create(sha256: hash('sha256', "register-{$register->id}"))->id);

            $this->acting()->withHeaders($this->ifMatch('section', $register))
                ->deleteJson("/api/v1/sections/{$register->id}")
                ->assertStatus(409)
                ->assertJsonPath('code', 'register_in_use');

            $this->assertModelExists($register);
            $this->assertNotNull(PhotoSlot::query()->find("register-{$register->id}"));
        }
    }

    // ------------------------------------------------------------- readers

    public function test_every_reader_outside_the_roster_carries_the_german_name(): void
    {
        $register = $this->register('Trompettes');
        $register->update(['name_de' => 'Trompeten']);
        $player = Member::factory()->inSection($register)->musician()->create(['public_visible' => true]);
        $event = Event::factory()->create();

        $this->acting($player)->getJson('/api/v1/me')->assertJsonPath('sectionNameDe', 'Trompeten');

        $band = collect($this->getJson('/api/v1/band')->assertOk()->json('data'));
        $this->assertSame('Trompeten', $band->firstWhere('id', $register->id)['nameDe']);

        $chase = collect($this->acting()->getJson("/api/v1/events/{$event->id}/attendance")->assertOk()->json('data'));
        $this->assertSame('Trompeten', $chase->firstWhere('memberId', $player->id)['sectionNameDe']);
    }
}
