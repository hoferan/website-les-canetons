<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Image;
use App\Models\Member;
use App\Models\PhotoSlot;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * Photo slots (#105): every place on the site that shows a library photo,
 * named by the page that shows it, one write per slot.
 */
class PhotoSlotTest extends TestCase
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

    public function test_the_slots_are_public_and_empty_by_default(): void
    {
        $this->getJson('/api/v1/photo-slots')
            ->assertStatus(200)
            ->assertJsonPath('data', [])
            ->assertJsonPath('meta.total', 0);
    }

    public function test_the_public_read_lists_every_placed_slot_by_name(): void
    {
        $band = $this->image('a');
        $entry = $this->image('b');
        $this->placePhoto('register-5', $band->id, 'Batteurs', '/band');
        $this->placePhoto('band', $band->id);
        $this->placePhoto('history-3', $entry->id);

        $response = $this->getJson('/api/v1/photo-slots')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 3);

        $this->assertSame(['band', 'history-3', 'register-5'], array_column($response->json('data'), 'slot'));
        $this->assertSame([
            'slot' => 'band',
            'url' => LibraryImage::url($band, 800),
            'width' => 800,
            'height' => 600,
            'srcset' => LibraryImage::url($band, 480).' 480w, '.LibraryImage::url($band, 800).' 800w',
        ], $response->json('data.0'));
        $this->assertSame(LibraryImage::url($entry, 800), $response->json('data.1.url'));

        // The page's own name and path are for the library, not the public.
        $this->assertArrayNotHasKey('label', $response->json('data.2'));
        $this->assertStringNotContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    public function test_the_first_placement_makes_the_slot_s_row_and_the_next_updates_it(): void
    {
        $first = $this->image('a');
        $second = $this->image('b');

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/godparents', ['imageId' => $first->id, 'label' => 'Parrains', 'path' => '/about'])
            ->assertStatus(200)
            ->assertExactJson(['photo' => [
                'url' => LibraryImage::url($first, 800),
                'width' => 800,
                'height' => 600,
                'srcset' => LibraryImage::url($first, 480).' 480w, '.LibraryImage::url($first, 800).' 800w',
            ]]);

        $slot = PhotoSlot::query()->findOrFail('godparents');
        $this->assertSame([$first->id, 'Parrains', '/about'], [$slot->image_id, $slot->label, $slot->path]);

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/godparents', ['imageId' => $second->id, 'label' => 'Marraines', 'path' => '/band'])
            ->assertStatus(200)
            ->assertJsonPath('photo.url', LibraryImage::url($second, 800));

        $this->assertSame(1, PhotoSlot::query()->count());
        $slot = PhotoSlot::query()->findOrFail('godparents');
        $this->assertSame([$second->id, 'Marraines', '/band'], [$slot->image_id, $slot->label, $slot->path]);

        // A placement without a name or a page clears both: each placement
        // says how the library describes the slot.
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/godparents', ['imageId' => $second->id])
            ->assertStatus(200);
        $slot = PhotoSlot::query()->findOrFail('godparents');
        $this->assertSame([null, null], [$slot->label, $slot->path]);
    }

    public function test_null_removes_the_slot_s_row(): void
    {
        $image = $this->image('a');
        $this->placePhoto('band', $image->id, 'Le groupe', '/band');

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/band', ['imageId' => null])
            ->assertStatus(200)
            ->assertExactJson(['photo' => null]);

        $this->assertNull(PhotoSlot::query()->find('band'));
        $this->assertSame([], $this->getJson('/api/v1/photo-slots')->json('data'));

        // Emptying a slot that is already empty is the same answer, not a 404.
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/band', ['imageId' => null])
            ->assertStatus(200)
            ->assertExactJson(['photo' => null]);
    }

    public function test_one_slot_s_write_leaves_every_other_slot_alone(): void
    {
        $old = $this->image('a');
        $new = $this->image('b');
        foreach (['band', 'concert', 'register-5', 'register-6'] as $slot) {
            $this->placePhoto($slot, $old->id, "label {$slot}");
        }

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/register-5', ['imageId' => $new->id])
            ->assertStatus(200);
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/concert', ['imageId' => null])
            ->assertStatus(200);

        $this->assertSame($new->id, $this->slotImage('register-5'));
        $this->assertSame($old->id, $this->slotImage('register-6'));
        $this->assertSame($old->id, $this->slotImage('band'));
        $this->assertNull($this->slotImage('concert'));
        $this->assertSame('label register-6', PhotoSlot::query()->findOrFail('register-6')->label);
    }

    public function test_any_name_the_key_allows_is_a_slot(): void
    {
        $image = $this->image('a');
        $names = ['register-5', '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c', 'home.hero_1', 'A', str_repeat('x', 64)];

        foreach ($names as $name) {
            $this->actingAsMember($this->manager)
                ->putJson("/api/v1/photo-slots/{$name}", ['imageId' => $image->id])
                ->assertStatus(200);
            $this->assertSame($image->id, $this->slotImage($name), "The slot {$name} was not placed.");
        }
    }

    public function test_a_name_outside_the_key_is_not_found(): void
    {
        $image = $this->image('a');

        foreach (['-band', '.band', str_repeat('x', 65), 'band/photo', 'band%20photo', 'band%2Fphoto', 'bänd'] as $name) {
            $this->actingAsMember($this->manager)
                ->putJson("/api/v1/photo-slots/{$name}", ['imageId' => $image->id])
                ->assertStatus(404);
        }

        $this->assertSame(0, PhotoSlot::query()->count());
    }

    public function test_a_placement_needs_no_if_match_and_hands_out_no_tag(): void
    {
        // Each write is one value, so it carries no tag; see ConditionalWrite.
        $image = $this->image('a');
        $this->placePhoto('band', $image->id);

        foreach ([['imageId' => $image->id], ['imageId' => null]] as $body) {
            $response = $this->actingAsMember($this->manager)
                ->putJson('/api/v1/photo-slots/band', $body)
                ->assertStatus(200);
            $this->assertNull($response->headers->get('ETag'), 'A placement hands out a tag nobody can use.');
        }

        $this->assertNull($this->getJson('/api/v1/photo-slots')->headers->get('ETag'));
    }

    public function test_an_unknown_image_is_refused_on_image_id(): void
    {
        $image = $this->image('a');
        $this->placePhoto('band', $image->id);

        foreach (['band', 'concert'] as $slot) {
            $this->actingAsMember($this->manager)
                ->putJson("/api/v1/photo-slots/{$slot}", ['imageId' => 424242])
                ->assertStatus(400)
                ->assertJsonPath('code', 'validation_failed')
                ->assertJsonPath('errors.0.field', 'imageId');
        }

        $this->assertSame($image->id, $this->slotImage('band'));
        $this->assertNull(PhotoSlot::query()->find('concert'));
        $this->assertSame(0, AuditEntry::query()->where('action', 'like', 'photo.%')->count());
    }

    public function test_a_body_without_image_id_is_refused(): void
    {
        // Null empties the slot, so leaving the field out must not mean the
        // same thing: a client that forgot it would wipe a photo.
        $image = $this->image('a');
        $this->placePhoto('band', $image->id);

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/band', ['label' => 'Le groupe'])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'imageId');

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/band', ['imageId' => 'abc'])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'imageId');

        $this->assertSame($image->id, $this->slotImage('band'));
    }

    public function test_a_label_too_long_or_a_path_that_is_not_a_path_is_refused(): void
    {
        $image = $this->image('a');

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/band', ['imageId' => $image->id, 'label' => str_repeat('a', 121)])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'label');

        foreach (['band', 'https://example.com/band', str_repeat('/', 256)] as $path) {
            $this->actingAsMember($this->manager)
                ->putJson('/api/v1/photo-slots/band', ['imageId' => $image->id, 'path' => $path])
                ->assertStatus(400)
                ->assertJsonPath('code', 'validation_failed')
                ->assertJsonPath('errors.0.field', 'path');
        }

        $this->assertSame(0, PhotoSlot::query()->count());

        // The longest of each is accepted.
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/band', [
                'imageId' => $image->id,
                'label' => str_repeat('a', 120),
                'path' => '/'.str_repeat('a', 254),
            ])
            ->assertStatus(200);
    }

    public function test_a_placement_that_loses_the_race_to_a_delete_is_refused_like_an_unknown_image(): void
    {
        $image = $this->image('a');

        // The delete lands after `exists` passed and before the upsert.
        $deleted = false;
        DB::beforeExecuting(function (string $query) use ($image, &$deleted): void {
            if (! $deleted && str_starts_with($query, 'insert into `photo_slots`')) {
                $deleted = true;
                Image::query()->whereKey($image->id)->delete();
            }
        });

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/concert', ['imageId' => $image->id])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'imageId');

        $this->assertTrue($deleted);
        $this->assertNull(PhotoSlot::query()->find('concert'));
        $this->assertSame(0, AuditEntry::query()->where('action', 'like', 'photo.%')->count());
    }

    public function test_every_placement_is_audited_by_slot(): void
    {
        $image = $this->image('a');

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/band', ['imageId' => $image->id, 'label' => 'Le groupe'])->assertOk();
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/history-12', ['imageId' => $image->id])->assertOk();
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-slots/band', ['imageId' => null])->assertOk();

        $entries = AuditEntry::query()->orderBy('id')->get()
            ->map(fn (AuditEntry $e) => [$e->actor_member_id, $e->action, $e->target_type, $e->target_id, $e->target_label])
            ->all();

        $this->assertSame([
            [$this->manager->id, 'photo.placed', 'photo_slot', null, 'band'],
            [$this->manager->id, 'photo.placed', 'photo_slot', null, 'history-12'],
            [$this->manager->id, 'photo.removed', 'photo_slot', null, 'band'],
        ], $entries);
    }

    public function test_placing_refuses_anonymous_and_unpermitted(): void
    {
        $image = $this->image('a');

        $this->putJson('/api/v1/photo-slots/band', ['imageId' => $image->id])
            ->assertStatus(401)->assertJson(['code' => 'not_authenticated']);

        // A player, and a history editor without the library: neither may
        // place anything, a history entry's photo included.
        $player = Member::factory()->inSection('Cloches')->create();
        $historyOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::HistoryManage)->create())
            ->create();

        foreach ([$player, $historyOnly] as $member) {
            foreach (['band', 'history-1'] as $slot) {
                $this->actingAsMember($member)
                    ->putJson("/api/v1/photo-slots/{$slot}", ['imageId' => $image->id])
                    ->assertStatus(403)->assertJson(['code' => 'access_denied']);
            }
        }

        $this->assertSame(0, PhotoSlot::query()->count());
    }

    public function test_the_published_document_describes_the_slot_and_its_body(): void
    {
        $document = json_decode((string) file_get_contents(__DIR__.'/../../openapi.json'), true);

        $schema = $document['components']['schemas']['PlacePhotoRequest'];
        $this->assertSame(['imageId'], $schema['required']);
        foreach (['imageId' => 'integer', 'label' => 'string', 'path' => 'string'] as $field => $type) {
            $types = (array) ($schema['properties'][$field]['type'] ?? []);
            $this->assertEqualsCanonicalizing([$type, 'null'], $types, "{$field} is typed differently in the document: ".json_encode($schema['properties'][$field]));
        }
        $this->assertSame(120, $schema['properties']['label']['maxLength']);
        $this->assertSame(255, $schema['properties']['path']['maxLength']);

        $put = $document['paths']['/photo-slots/{slot}']['put'];
        $this->assertSame(
            '#/components/schemas/PlacePhotoRequest',
            $put['requestBody']['content']['application/json']['schema']['$ref'] ?? null,
        );
        $this->assertSame(PhotoSlot::KEY, $put['parameters'][0]['schema']['pattern'] ?? null);
        $this->assertArrayHasKey('get', $document['paths']['/photo-slots']);

        foreach (['/site-photos', '/site-photos/{slot}', '/sections/{section}/photo', '/history/{historyEntry}/photo'] as $gone) {
            $this->assertArrayNotHasKey($gone, $document['paths'], "{$gone} is still in the document.");
        }
    }

    private function image(string $seed): Image
    {
        return LibraryImage::create(str_repeat($seed, 64), 800, 600, [800, 480]);
    }
}
