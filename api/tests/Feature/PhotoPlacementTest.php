<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Image;
use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Models\SitePhoto;
use App\Support\EntityTag;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * Placing library photos on the band, concert and register slots (#105).
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

    public function test_the_public_read_is_cacheable_and_follows_a_cleared_slot(): void
    {
        $image = $this->image('a');
        $body = $this->body();
        $body['band'] = ['imageId' => $image->id];
        $this->placeAll($body)->assertStatus(200);

        $placed = $this->getJson('/api/v1/site-photos')->assertStatus(200);
        $this->assertNotNull($placed->json('band'));
        $this->assertStringNotContainsString('no-store', (string) $placed->headers->get('Cache-Control'));

        $this->placeAll($this->body())->assertStatus(200);

        $this->getJson('/api/v1/site-photos')->assertExactJson(['band' => null, 'concert' => null]);
    }

    public function test_the_published_document_types_every_image_id_as_an_integer_or_null(): void
    {
        $document = json_decode((string) file_get_contents(__DIR__.'/../../openapi.json'), true);
        $schemas = $document['components']['schemas'];

        $type = fn (array $schema) => $schema['properties']['imageId']['type'] ?? null;
        $sorted = function ($types) {
            $types = (array) $types;
            sort($types);

            return $types;
        };

        $expected = ['integer', 'null'];
        $found = 0;

        foreach ([
            $schemas['PhotoPlacementsResource']['properties']['band'],
            $schemas['PhotoPlacementsResource']['properties']['concert'],
            $schemas['PhotoPlacementRegisterResource'],
            $schemas['UpdatePhotoPlacementsRequest']['properties']['band'],
            $schemas['UpdatePhotoPlacementsRequest']['properties']['concert'],
            $schemas['UpdatePhotoPlacementsRequest']['properties']['registers']['items'],
        ] as $slot) {
            $this->assertSame($expected, $sorted($type($slot)), 'imageId is typed differently in the document: '.json_encode($slot));
            $found++;
        }

        $this->assertSame(6, $found);
    }

    public function test_the_placements_read_lists_every_register_with_an_empty_slot(): void
    {
        $response = $this->actingAsMember($this->manager)->getJson('/api/v1/photo-placements')
            ->assertStatus(200)
            ->assertJsonPath('band', ['imageId' => null])
            ->assertJsonPath('concert', ['imageId' => null]);

        $this->assertSame(
            Section::query()->orderBy('sort_order')->pluck('name')->all(),
            array_column($response->json('registers'), 'name'),
        );
        $this->assertNotEmpty($response->headers->get('ETag'));
    }

    public function test_placing_band_concert_and_a_register(): void
    {
        $band = $this->image('a');
        $concert = $this->image('b');
        $drums = Section::query()->where('name', 'Batteurs')->sole();

        $body = $this->body();
        $body['band'] = ['imageId' => $band->id];
        $body['concert'] = ['imageId' => $concert->id];
        $body['registers'] = array_map(
            fn (array $row) => $row['sectionId'] === $drums->id
                ? ['sectionId' => $drums->id, 'imageId' => $band->id]
                : $row,
            $body['registers'],
        );

        $response = $this->placeAll($body)->assertStatus(200);

        $response->assertJsonPath('band.imageId', $band->id)
            ->assertJsonPath('concert.imageId', $concert->id);

        // Name is read-only and comes back on every register row.
        $row = collect($response->json('registers'))->firstWhere('sectionId', $drums->id);
        $this->assertSame('Batteurs', $row['name']);
        $this->assertSame($band->id, $row['imageId']);

        // The public read now shows what was placed.
        $public = $this->getJson('/api/v1/site-photos')->assertStatus(200);
        $this->assertSame($band->width, $public->json('band.width'));
        $this->assertNull($public->json('band.altFr'));
        $this->assertNull($public->json('band.altDe'));
        $this->assertSame(LibraryImage::url($concert, 800), $public->json('concert.url'));
        $this->assertSame(
            LibraryImage::url($concert, 480).' 480w, '.LibraryImage::url($concert, 800).' 800w',
            $public->json('concert.srcset'),
        );

        $this->assertSame($band->id, $drums->fresh()->image_id);

        $this->assertTrue(AuditEntry::query()->where('action', 'photos.placed')->exists());
    }

    public function test_a_slot_keeps_no_alt_text_whatever_the_body_says(): void
    {
        $image = $this->image('a');

        $body = $this->body();
        $body['band'] = ['imageId' => $image->id, 'altFr' => 'Le groupe', 'altDe' => 'Die Gruppe'];

        $this->placeAll($body)
            ->assertStatus(200)
            ->assertJsonPath('band', ['imageId' => $image->id]);

        $this->getJson('/api/v1/site-photos')
            ->assertJsonPath('band.altFr', null)
            ->assertJsonPath('band.altDe', null);
    }

    public function test_clearing_a_slot_empties_it(): void
    {
        $image = $this->image('a');
        SitePhoto::query()->whereKey('band')->update(['image_id' => $image->id]);

        $this->placeAll($this->body())
            ->assertStatus(200)
            ->assertJsonPath('band', ['imageId' => null]);

        $this->assertNull(SitePhoto::query()->findOrFail('band')->image_id);
    }

    public function test_put_must_list_every_register_once(): void
    {
        $body = $this->body();
        array_pop($body['registers']);

        $this->placeAll($body)
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonFragment(['field' => 'registers', 'reason' => 'invalid_value']);

        $body = $this->body();
        $body['registers'][] = $body['registers'][0];

        $this->placeAll($body)->assertStatus(400)
            ->assertJsonFragment(['field' => 'registers', 'reason' => 'invalid_value']);

        $body = $this->body();
        $body['registers'][0]['sectionId'] = 999999;

        $this->placeAll($body)->assertStatus(400)
            ->assertJsonFragment(['field' => 'registers', 'reason' => 'invalid_value']);
    }

    public function test_an_unknown_image_is_refused(): void
    {
        $body = $this->body();
        $body['band']['imageId'] = 424242;

        $this->placeAll($body)
            ->assertStatus(400)
            ->assertJsonFragment(['field' => 'band.imageId']);

        $this->assertNull(SitePhoto::query()->findOrFail('band')->image_id);
    }

    public function test_a_placement_that_loses_the_race_to_a_delete_is_refused_like_an_unknown_image(): void
    {
        $image = $this->image('a');
        $body = $this->body();
        $body['concert']['imageId'] = $image->id;

        // The delete lands after `exists` passed and before the first UPDATE.
        $deleted = false;
        DB::beforeExecuting(function (string $query) use ($image, &$deleted): void {
            if (! $deleted && str_starts_with($query, 'update `site_photos`')) {
                $deleted = true;
                Image::query()->whereKey($image->id)->delete();
            }
        });

        $this->placeAll($body)
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'concert.imageId');

        $this->assertTrue($deleted);
        $this->assertNull(SitePhoto::query()->findOrFail('concert')->image_id);
    }

    public function test_a_refused_put_changes_nothing(): void
    {
        $image = $this->image('a');
        $body = $this->body();
        $body['band']['imageId'] = $image->id;
        array_pop($body['registers']);

        $this->placeAll($body)->assertStatus(400);

        $this->assertNull(SitePhoto::query()->findOrFail('band')->image_id);
    }

    public function test_placements_need_if_match(): void
    {
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-placements', $this->body())
            ->assertStatus(428);

        $stale = ['If-Match' => '"stale"'];
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-placements', $this->body(), $stale)
            ->assertStatus(412);
    }

    public function test_the_tag_changes_after_a_put(): void
    {
        $image = $this->image('a');
        $before = EntityTag::computeFacet('site_photos');

        $body = $this->body();
        $body['concert']['imageId'] = $image->id;

        $response = $this->placeAll($body)->assertStatus(200);

        $after = EntityTag::computeFacet('site_photos');
        $this->assertNotSame($before, $after);
        $this->assertSame($after, $response->headers->get('ETag'));

        // The old tag is now stale.
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/photo-placements', $this->body(), ['If-Match' => $before])
            ->assertStatus(412);
    }

    public function test_the_tag_moves_when_only_a_register_changes(): void
    {
        $image = $this->image('a');
        $before = EntityTag::computeFacet('site_photos');

        Section::query()->orderBy('sort_order')->firstOrFail()->update(['image_id' => $image->id]);

        $this->assertNotSame($before, EntityTag::computeFacet('site_photos'));
    }

    public function test_placements_refuse_anonymous_and_unpermitted(): void
    {
        $this->getJson('/api/v1/photo-placements')->assertStatus(401);
        $this->putJson('/api/v1/photo-placements', $this->body())->assertStatus(401);

        $player = Member::factory()->inSection('Cloches')->create();

        $this->actingAsMember($player)->getJson('/api/v1/photo-placements')
            ->assertStatus(403)->assertJson(['code' => 'access_denied']);
        $this->actingAsMember($player)
            ->putJson('/api/v1/photo-placements', $this->body())
            ->assertStatus(403);
    }

    private function image(string $seed): Image
    {
        return LibraryImage::create(str_repeat($seed, 64), 800, 600, [800, 480]);
    }

    /**
     * The current placements as a PUT body: every register listed, nothing placed.
     *
     * @return array{band: array<string, mixed>, concert: array<string, mixed>, registers: list<array<string, mixed>>}
     */
    private function body(): array
    {
        $empty = ['imageId' => null];

        return [
            'band' => $empty,
            'concert' => $empty,
            'registers' => Section::query()->orderBy('sort_order')->get()
                ->map(fn (Section $s) => ['sectionId' => $s->id] + $empty)
                ->all(),
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function placeAll(array $body): TestResponse
    {
        return $this->actingAsMember($this->manager)->putJson(
            '/api/v1/photo-placements',
            $body,
            $this->ifMatchFacet('site_photos'),
        );
    }
}
