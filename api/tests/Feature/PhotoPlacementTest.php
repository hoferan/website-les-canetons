<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Models\SitePhoto;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * Placing library photos (#105): one write per place, for the band and
 * concert slots, a register and a history entry.
 */
class PhotoPlacementTest extends TestCase
{
    use RefreshDatabase;

    private Member $manager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = Member::factory()
            ->withRole(Role::factory()->granting(Permission::ImagesManage)->create())
            ->create();
    }

    public function test_site_photos_are_public_and_null_by_default(): void
    {
        $this->getJson('/api/v1/site-photos')
            ->assertStatus(200)
            ->assertExactJson(['band' => null, 'concert' => null]);
    }

    public function test_placing_the_band_and_concert_photos(): void
    {
        $band = $this->image('a');
        $concert = $this->image('b');

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/site-photos/band', ['imageId' => $band->id])
            ->assertStatus(200)
            ->assertExactJson(['photo' => [
                'url' => LibraryImage::url($band, 800),
                'width' => 800,
                'height' => 600,
                'srcset' => LibraryImage::url($band, 480).' 480w, '.LibraryImage::url($band, 800).' 800w',
            ]]);
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/site-photos/concert', ['imageId' => $concert->id])
            ->assertStatus(200)
            ->assertJsonPath('photo.url', LibraryImage::url($concert, 800));

        $this->assertSame($band->id, SitePhoto::query()->findOrFail('band')->image_id);
        $this->assertSame($concert->id, SitePhoto::query()->findOrFail('concert')->image_id);

        // The public read now shows what was placed, and stays cacheable.
        $public = $this->getJson('/api/v1/site-photos')->assertStatus(200);
        $this->assertSame(LibraryImage::url($band, 800), $public->json('band.url'));
        $this->assertSame(LibraryImage::url($concert, 800), $public->json('concert.url'));
        $this->assertStringNotContainsString('no-store', (string) $public->headers->get('Cache-Control'));
    }

    public function test_placing_a_register_photo_shows_on_the_band_page(): void
    {
        $image = $this->image('a');
        $drums = $this->register('Batteurs');

        $this->actingAsMember($this->manager)
            ->putJson("/api/v1/sections/{$drums->id}/photo", ['imageId' => $image->id])
            ->assertStatus(200)
            ->assertJsonPath('photo.width', 800);

        $this->assertSame($image->id, $this->registerImage($drums));
        $this->assertSame(LibraryImage::url($image, 800), $this->bandPhoto('Batteurs')['url'] ?? null);
    }

    public function test_placing_a_history_photo_shows_on_the_history(): void
    {
        $image = $this->image('a');
        $entry = HistoryEntry::factory()->create();

        $this->actingAsMember($this->historyEditor())
            ->putJson("/api/v1/history/{$entry->id}/photo", ['imageId' => $image->id])
            ->assertStatus(200)
            ->assertJsonPath('photo.width', 800);

        $this->assertSame($image->id, $entry->fresh()?->image_id);

        $row = collect($this->getJson('/api/v1/history')->json('data'))->firstWhere('id', $entry->id);
        $this->assertSame($image->id, $row['imageId']);
        $this->assertSame(LibraryImage::url($image, 800), $row['photo']['url']);
    }

    public function test_null_empties_each_kind_of_place(): void
    {
        $image = $this->image('a');
        $drums = $this->register('Batteurs');
        $entry = HistoryEntry::factory()->create(['image_id' => $image->id]);
        SitePhoto::query()->whereKey('band')->update(['image_id' => $image->id]);
        $drums->update(['image_id' => $image->id]);

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/site-photos/band', ['imageId' => null])
            ->assertStatus(200)->assertExactJson(['photo' => null]);
        $this->actingAsMember($this->manager)
            ->putJson("/api/v1/sections/{$drums->id}/photo", ['imageId' => null])
            ->assertStatus(200)->assertExactJson(['photo' => null]);
        $this->actingAsMember($this->historyEditor())
            ->putJson("/api/v1/history/{$entry->id}/photo", ['imageId' => null])
            ->assertStatus(200)->assertExactJson(['photo' => null]);

        $this->assertNull(SitePhoto::query()->findOrFail('band')->image_id);
        $this->assertNull($this->registerImage($drums));
        $this->assertNull($entry->fresh()?->image_id);

        // Read as a member. After writes by two different members, a plain
        // read in the same test still carries the second login but not its
        // session date, and answers 401 (measured). A browser's read carries
        // its own cookie, so this is the harness, not the route.
        $this->actingAsMember($this->manager)->getJson('/api/v1/site-photos')
            ->assertExactJson(['band' => null, 'concert' => null]);
        $this->assertNull($this->bandPhoto('Batteurs'));
    }

    public function test_one_place_s_write_leaves_every_other_place_alone(): void
    {
        $old = $this->image('a');
        $new = $this->image('b');
        $drums = $this->register('Batteurs');
        $bells = $this->register('Cloches');
        $entry = HistoryEntry::factory()->create(['image_id' => $old->id]);
        SitePhoto::query()->update(['image_id' => $old->id]);
        Section::query()->update(['image_id' => $old->id]);

        $this->actingAsMember($this->manager)
            ->putJson("/api/v1/sections/{$drums->id}/photo", ['imageId' => $new->id])
            ->assertStatus(200);
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/site-photos/concert', ['imageId' => null])
            ->assertStatus(200);

        $this->assertSame($new->id, $this->registerImage($drums));
        $this->assertSame($old->id, $this->registerImage($bells));
        $this->assertSame(
            1,
            Section::query()->where('image_id', $new->id)->count(),
            'Placing one register photo touched another register.',
        );
        $this->assertSame($old->id, SitePhoto::query()->findOrFail('band')->image_id);
        $this->assertNull(SitePhoto::query()->findOrFail('concert')->image_id);
        $this->assertSame($old->id, $entry->fresh()?->image_id);
    }

    public function test_a_placement_needs_no_if_match(): void
    {
        // Each write is one value, so it carries no tag; see ConditionalWrite.
        $image = $this->image('a');
        $entry = HistoryEntry::factory()->create();

        $writes = [
            '/api/v1/site-photos/band' => $this->manager,
            "/api/v1/sections/{$this->register('Lyre')->id}/photo" => $this->manager,
            "/api/v1/history/{$entry->id}/photo" => $this->historyEditor(),
        ];

        foreach ($writes as $uri => $as) {
            $response = $this->actingAsMember($as)
                ->putJson($uri, ['imageId' => $image->id])
                ->assertStatus(200);
            $this->assertNull($response->headers->get('ETag'), "{$uri} hands out a tag nobody can use.");
        }
    }

    public function test_an_unknown_image_is_refused_on_image_id(): void
    {
        $drums = $this->register('Batteurs');
        $entry = HistoryEntry::factory()->create();

        foreach ([
            '/api/v1/site-photos/band' => $this->manager,
            "/api/v1/sections/{$drums->id}/photo" => $this->manager,
            "/api/v1/history/{$entry->id}/photo" => $this->historyEditor(),
        ] as $uri => $as) {
            $this->actingAsMember($as)
                ->putJson($uri, ['imageId' => 424242])
                ->assertStatus(400)
                ->assertJsonPath('code', 'validation_failed')
                ->assertJsonPath('errors.0.field', 'imageId');
        }

        $this->assertNull(SitePhoto::query()->findOrFail('band')->image_id);
        $this->assertNull($this->registerImage($drums));
        $this->assertNull($entry->fresh()?->image_id);
        $this->assertSame(0, AuditEntry::query()->where('action', 'like', 'photo.%')->count());
    }

    public function test_a_body_without_image_id_is_refused(): void
    {
        // Null empties the place, so leaving the field out must not mean the
        // same thing: a client that forgot it would wipe a photo.
        $image = $this->image('a');
        SitePhoto::query()->whereKey('band')->update(['image_id' => $image->id]);

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/site-photos/band', [])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'imageId');

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/site-photos/band', ['imageId' => 'abc'])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'imageId');

        $this->assertSame($image->id, SitePhoto::query()->findOrFail('band')->image_id);
    }

    public function test_an_unknown_slot_section_or_entry_is_not_found(): void
    {
        $image = $this->image('a');

        foreach (['/api/v1/site-photos/hero', '/api/v1/sections/999999/photo'] as $uri) {
            $this->actingAsMember($this->manager)
                ->putJson($uri, ['imageId' => $image->id])
                ->assertStatus(404);
        }
        $this->actingAsMember($this->historyEditor())
            ->putJson('/api/v1/history/999999/photo', ['imageId' => $image->id])
            ->assertStatus(404);

        $this->assertSame(['band', 'concert'], SitePhoto::query()->orderBy('slot')->pluck('slot')->all());
    }

    public function test_a_placement_that_loses_the_race_to_a_delete_is_refused_like_an_unknown_image(): void
    {
        $image = $this->image('a');

        // The delete lands after `exists` passed and before the UPDATE.
        $deleted = false;
        DB::beforeExecuting(function (string $query) use ($image, &$deleted): void {
            if (! $deleted && str_starts_with($query, 'update `site_photos`')) {
                $deleted = true;
                Image::query()->whereKey($image->id)->delete();
            }
        });

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/site-photos/concert', ['imageId' => $image->id])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'imageId');

        $this->assertTrue($deleted);
        $this->assertNull(SitePhoto::query()->findOrFail('concert')->image_id);
    }

    public function test_every_placement_is_audited(): void
    {
        $image = $this->image('a');
        $drums = $this->register('Batteurs');
        $entry = HistoryEntry::factory()->create(['title_fr' => 'La fondation']);
        $editor = $this->historyEditor();

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/site-photos/band', ['imageId' => $image->id])->assertOk();
        $this->actingAsMember($this->manager)
            ->putJson("/api/v1/sections/{$drums->id}/photo", ['imageId' => $image->id])->assertOk();
        $this->actingAsMember($editor)
            ->putJson("/api/v1/history/{$entry->id}/photo", ['imageId' => null])->assertOk();

        $entries = AuditEntry::query()->orderBy('id')->get()
            ->map(fn (AuditEntry $e) => [$e->actor_member_id, $e->action, $e->target_type, $e->target_id, $e->target_label])
            ->all();

        $this->assertSame([
            [$this->manager->id, 'photo.placed', 'site_photo', null, 'band'],
            [$this->manager->id, 'photo.placed', 'section', $drums->id, 'Batteurs'],
            [$editor->id, 'photo.removed', 'history_entry', $entry->id, 'La fondation'],
        ], $entries);
    }

    public function test_placements_refuse_anonymous_and_unpermitted(): void
    {
        $image = $this->image('a');
        $drums = $this->register('Batteurs');
        $entry = HistoryEntry::factory()->create();
        $uris = [
            '/api/v1/site-photos/band',
            "/api/v1/sections/{$drums->id}/photo",
            "/api/v1/history/{$entry->id}/photo",
        ];

        foreach ($uris as $uri) {
            $this->putJson($uri, ['imageId' => $image->id])
                ->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
        }

        // A player, and a history editor without the library: neither may
        // place anything, a history entry's photo included.
        $player = Member::factory()->inSection('Cloches')->create();
        $historyOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::HistoryManage)->create())
            ->create();

        foreach ([$player, $historyOnly] as $member) {
            foreach ($uris as $uri) {
                $this->actingAsMember($member)
                    ->putJson($uri, ['imageId' => $image->id])
                    ->assertStatus(403)->assertJson(['code' => 'access_denied']);
            }
        }

        $this->assertNull(SitePhoto::query()->findOrFail('band')->image_id);
        $this->assertNull($this->registerImage($drums));
        $this->assertNull($entry->fresh()?->image_id);
    }

    public function test_a_history_photo_needs_history_manage_as_well(): void
    {
        $image = $this->image('a');
        $entry = HistoryEntry::factory()->create();

        $this->actingAsMember($this->manager)
            ->putJson("/api/v1/history/{$entry->id}/photo", ['imageId' => $image->id])
            ->assertStatus(403)->assertJson(['code' => 'access_denied']);

        $this->assertNull($entry->fresh()?->image_id);
    }

    public function test_the_published_document_types_every_image_id_as_an_integer_or_null(): void
    {
        $document = json_decode((string) file_get_contents(__DIR__.'/../../openapi.json'), true);

        $property = $document['components']['schemas']['PlacePhotoRequest']['properties']['imageId'];
        $types = (array) ($property['type'] ?? []);
        sort($types);
        $this->assertSame(['integer', 'null'], $types, 'imageId is typed differently in the document: '.json_encode($property));

        foreach (['/site-photos/{slot}', '/sections/{section}/photo', '/history/{historyEntry}/photo'] as $path) {
            $this->assertSame(
                '#/components/schemas/PlacePhotoRequest',
                $document['paths'][$path]['put']['requestBody']['content']['application/json']['schema']['$ref'] ?? null,
                "{$path} does not take the one placement body.",
            );
        }
    }

    private function image(string $seed): Image
    {
        return LibraryImage::create(str_repeat($seed, 64), 800, 600, [800, 480]);
    }

    private function register(string $name): Section
    {
        return Section::query()->where('name', $name)->sole();
    }

    private function registerImage(Section $register): ?int
    {
        $id = Section::query()->whereKey($register->id)->value('image_id');

        return $id === null ? null : (int) $id;
    }

    /** May place a history entry's photo: both permissions. */
    private function historyEditor(): Member
    {
        return Member::factory()
            ->withRole(Role::factory()->granting(Permission::HistoryManage, Permission::ImagesManage)->create())
            ->create();
    }

    /**
     * The photo the public band page shows for one register.
     *
     * @return array<string, mixed>|null
     */
    private function bandPhoto(string $register): ?array
    {
        $row = collect($this->getJson('/api/v1/band')->assertOk()->json('data'))->firstWhere('name', $register);
        $this->assertNotNull($row, "The band page did not list the register {$register}.");

        return $row['photo'];
    }
}
