<?php

namespace Tests\Feature;

use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\Member;
use App\Models\Role;
use App\Support\EntityTag;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\LibraryImage;
use Tests\TestCase;

class HistoryEntryTest extends TestCase
{
    use RefreshDatabase;

    private Member $editor;

    private Member $player;

    protected function setUp(): void
    {
        parent::setUp();
        $this->editor = Member::factory()
            ->withRole(Role::factory()->granting(Permission::HistoryManage)->create())
            ->create();
        $this->player = Member::factory()->inSection('Cloches')->create();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'occurredOn' => '2002-10-15',
            'precision' => 'month',
            'titleFr' => 'Les débuts',
            'bodyFr' => null,
            'titleDe' => null,
            'bodyDe' => null,
            'important' => true,
            'icon' => 'flag',
        ], $overrides);
    }

    public function test_the_list_is_public_and_oldest_first(): void
    {
        HistoryEntry::query()->delete();
        HistoryEntry::factory()->create(['occurred_on' => '2019-01-01', 'title_fr' => 'B']);
        HistoryEntry::factory()->create(['occurred_on' => '2002-10-01', 'title_fr' => 'A']);

        $this->getJson('/api/v1/history')
            ->assertOk()
            ->assertJsonPath('data.0.titleFr', 'A')
            ->assertJsonPath('data.1.titleFr', 'B')
            ->assertJsonPath('data.0.occurredOn', '2002-10-01');
    }

    public function test_writes_need_a_session_then_the_permission(): void
    {
        $entry = HistoryEntry::factory()->create();
        $before = HistoryEntry::count();

        $this->postJson('/api/v1/history', $this->payload())
            ->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
        $this->actingAsMember($this->player)->postJson('/api/v1/history', $this->payload())
            ->assertStatus(403)->assertJson(['code' => 'access_denied']);
        $this->actingAsMember($this->player)->getJson("/api/v1/history/{$entry->id}")
            ->assertStatus(403);
        $this->assertSame($before, HistoryEntry::count());
    }

    public function test_it_creates_and_truncates_the_date_to_its_precision(): void
    {
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['occurredOn' => '2019-06-14', 'precision' => 'year']))
            ->assertStatus(201)
            ->assertJsonPath('occurredOn', '2019-01-01')
            ->assertJsonPath('icon', 'flag')
            ->assertJsonPath('important', true);
    }

    public function test_any_single_text_field_is_enough(): void
    {
        foreach (['titleFr', 'bodyFr', 'titleDe', 'bodyDe'] as $field) {
            $this->actingAsMember($this->editor)
                ->postJson('/api/v1/history', $this->payload(['titleFr' => null, $field => 'Texte']))
                ->assertStatus(201)
                ->assertJsonPath($field, 'Texte');
        }
    }

    public function test_four_empty_or_blank_fields_are_refused_as_an_empty_entry(): void
    {
        $before = HistoryEntry::count();

        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload([
                'titleFr' => '   ', 'bodyFr' => '', 'titleDe' => null, 'bodyDe' => "\n",
            ]))
            ->assertStatus(422)
            ->assertJson(['code' => 'history_entry_empty']);
        $this->assertSame($before, HistoryEntry::count());
    }

    public function test_blank_strings_are_stored_as_null(): void
    {
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['bodyFr' => '  ']))
            ->assertStatus(201)
            ->assertJsonPath('bodyFr', null);
    }

    public function test_an_unknown_icon_and_precision_are_refused(): void
    {
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['icon' => 'rocket']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'icon')
            ->assertJsonPath('errors.0.reason', 'invalid_value');
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['precision' => 'week']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'precision');
    }

    public function test_a_title_over_120_is_refused(): void
    {
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['titleFr' => str_repeat('a', 121)]))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'titleFr')
            ->assertJsonPath('errors.0.reason', 'too_long');
    }

    public function test_update_and_delete_need_the_current_tag(): void
    {
        $entry = HistoryEntry::factory()->create();

        $this->actingAsMember($this->editor)
            ->putJson("/api/v1/history/{$entry->id}", $this->payload())
            ->assertStatus(428)->assertJson(['code' => 'if_match_required']);
        $this->actingAsMember($this->editor)
            ->withHeader('If-Match', '"stale"')
            ->deleteJson("/api/v1/history/{$entry->id}")
            ->assertStatus(412)->assertJson(['code' => 'if_match_failed']);

        $this->actingAsMember($this->editor)
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['titleFr' => 'Corrigé']))
            ->assertOk()->assertJsonPath('titleFr', 'Corrigé');

        $entry->refresh();
        $this->actingAsMember($this->editor)
            ->withHeaders($this->ifMatch('history', $entry))
            ->deleteJson("/api/v1/history/{$entry->id}")
            ->assertOk()->assertJson(['ok' => true]);
        $this->assertDatabaseMissing('history_entries', ['id' => $entry->id]);
    }

    public function test_an_update_to_nothing_is_refused_and_keeps_the_entry(): void
    {
        $entry = HistoryEntry::factory()->create(['title_fr' => 'Gardé']);

        $this->actingAsMember($this->editor)
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['titleFr' => ' ']))
            ->assertStatus(422)
            ->assertJson(['code' => 'history_entry_empty']);
        $this->assertSame('Gardé', $entry->refresh()->title_fr);
    }

    private function image(string $seed = 'a'): Image
    {
        return LibraryImage::create(str_repeat($seed, 64), 800, 600, [800, 480]);
    }

    // The photo has a write of its own, PUT /history/{historyEntry}/photo,
    // tested in PhotoPlacementTest. The entry's own writes leave it alone.

    public function test_the_entry_write_ignores_a_photo_in_the_body(): void
    {
        $image = $this->image();
        $entry = HistoryEntry::factory()->create(['image_id' => $image->id]);

        // An id that exists, one that does not and null all change nothing,
        // and none is refused: the field is simply not read.
        foreach ([$this->image('b')->id, 999999, null] as $sent) {
            $entry->refresh();
            $this->actingAsMember($this->editor)
                ->withHeaders($this->ifMatch('history', $entry))
                ->putJson("/api/v1/history/{$entry->id}", $this->payload(['titleFr' => 'Changé', 'imageId' => $sent]))
                ->assertOk()
                ->assertJsonPath('titleFr', 'Changé')
                ->assertJsonPath('imageId', $image->id)
                ->assertJsonPath('photo.width', 800);

            $this->assertSame($image->id, $entry->fresh()->image_id);
        }

        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['imageId' => $image->id]))
            ->assertStatus(201)
            ->assertJsonPath('imageId', null)
            ->assertJsonPath('photo', null);
    }

    public function test_the_entry_read_carries_its_photo(): void
    {
        $image = $this->image();
        $entry = HistoryEntry::factory()->create(['image_id' => $image->id]);

        $response = $this->actingAsMember($this->editor)
            ->getJson("/api/v1/history/{$entry->id}")
            ->assertOk()
            ->assertJsonPath('imageId', $image->id)
            ->assertJsonPath('photo', [
                'url' => LibraryImage::url($image, 800),
                'width' => 800,
                'height' => 600,
                'srcset' => LibraryImage::url($image, 480).' 480w, '.LibraryImage::url($image, 800).' 800w',
            ]);

        $this->assertIsInt($response->json('imageId'));
        $this->assertArrayNotHasKey('imageAltFr', $response->json());
        $this->assertArrayNotHasKey('imageAltDe', $response->json());
    }

    public function test_the_history_tag_changes_with_the_photo(): void
    {
        $entry = HistoryEntry::factory()->create();
        $before = EntityTag::compute('history', $entry);

        $entry->update(['image_id' => $this->image()->id]);
        $this->assertNotSame($before, EntityTag::compute('history', $entry->fresh()));
    }

    public function test_the_public_history_carries_the_photo(): void
    {
        HistoryEntry::query()->delete();
        $image = $this->image();
        HistoryEntry::factory()->create(['occurred_on' => '2002-10-01', 'image_id' => $image->id]);
        HistoryEntry::factory()->create(['occurred_on' => '2019-01-01']);

        $response = $this->getJson('/api/v1/history')
            ->assertOk()
            ->assertJsonPath('data.0.photo.width', 800)
            ->assertJsonPath('data.0.photo.height', 600)
            ->assertJsonPath('data.1.photo', null);

        $photo = $response->json('data.0.photo');
        $this->assertSame(LibraryImage::url($image, 800), $photo['url']);
        $this->assertSame(['url', 'width', 'height', 'srcset'], array_keys($photo));
    }

    public function test_listing_the_history_costs_a_fixed_number_of_queries(): void
    {
        HistoryEntry::query()->delete();
        $image = $this->image();
        HistoryEntry::factory()->count(6)->create(['image_id' => $image->id]);

        DB::enableQueryLog();
        $this->getJson('/api/v1/history')->assertOk();
        $few = count(DB::getQueryLog());

        HistoryEntry::factory()->count(6)->create(['image_id' => $this->image('b')->id]);
        DB::flushQueryLog();
        $this->getJson('/api/v1/history')->assertOk();

        $this->assertSame($few, count(DB::getQueryLog()));
    }

    public function test_show_hands_out_the_tag_the_writes_want(): void
    {
        $entry = HistoryEntry::factory()->create();

        $tag = $this->actingAsMember($this->editor)
            ->getJson("/api/v1/history/{$entry->id}")
            ->assertOk()
            ->headers->get('ETag');

        $this->assertNotEmpty($tag);
        $this->actingAsMember($this->editor)
            ->withHeader('If-Match', $tag)
            ->putJson("/api/v1/history/{$entry->id}", $this->payload())
            ->assertOk();
    }

    public function test_the_published_document_types_the_entry_image_id_as_an_integer_or_null(): void
    {
        $document = json_decode((string) file_get_contents(__DIR__.'/../../openapi.json'), true);
        $schemas = $document['components']['schemas'];

        $property = $schemas['HistoryEntryResource']['properties']['imageId'];
        $types = (array) ($property['type'] ?? []);
        sort($types);
        $this->assertSame(['integer', 'null'], $types, 'imageId is typed differently in the document: '.json_encode($property));

        // The entry's own write does not take a photo, so a generated client
        // must not offer to send one.
        $this->assertArrayNotHasKey('imageId', $schemas['StoreHistoryEntryRequest']['properties']);
    }
}
