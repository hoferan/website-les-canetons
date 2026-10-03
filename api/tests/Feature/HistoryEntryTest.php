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

    /** An editor who may write the history but not touch the photo library. */
    private function historyOnlyEditor(): Member
    {
        return $this->editor;
    }

    /** An editor who may do both. */
    private function photoEditor(): Member
    {
        return Member::factory()
            ->withRole(Role::factory()->granting(Permission::HistoryManage, Permission::ImagesManage)->create())
            ->create();
    }

    public function test_an_entry_can_carry_a_photo_and_alts(): void
    {
        $image = $this->image();

        $created = $this->actingAsMember($this->photoEditor())
            ->postJson('/api/v1/history', $this->payload([
                'imageId' => $image->id, 'imageAltFr' => 'Le cortège', 'imageAltDe' => 'Der Umzug',
            ]))
            ->assertStatus(201)
            ->assertJsonPath('imageId', $image->id)
            ->assertJsonPath('imageAltFr', 'Le cortège')
            ->assertJsonPath('imageAltDe', 'Der Umzug')
            ->assertJsonPath('photo.width', 800)
            ->assertJsonPath('photo.altFr', 'Le cortège')
            ->assertJsonPath('photo.altDe', 'Der Umzug');
        $this->assertIsInt($created->json('imageId'));

        $entry = HistoryEntry::query()->findOrFail($created->json('id'));
        $this->assertSame($image->id, $entry->image_id);

        $other = $this->image('b');
        $this->actingAsMember($this->photoEditor())
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload([
                'imageId' => $other->id, 'imageAltFr' => 'Autre', 'imageAltDe' => null,
            ]))
            ->assertOk()
            ->assertJsonPath('imageId', $other->id)
            ->assertJsonPath('imageAltFr', 'Autre')
            ->assertJsonPath('imageAltDe', null);
    }

    public function test_clearing_the_photo_clears_the_alts(): void
    {
        $entry = HistoryEntry::factory()->create([
            'image_id' => $this->image()->id, 'image_alt_fr' => 'Le cortège', 'image_alt_de' => 'Der Umzug',
        ]);

        $this->actingAsMember($this->photoEditor())
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload([
                'imageId' => null, 'imageAltFr' => 'Reste', 'imageAltDe' => 'Bleibt',
            ]))
            ->assertOk()
            ->assertJsonPath('imageId', null)
            ->assertJsonPath('photo', null)
            ->assertJsonPath('imageAltFr', null)
            ->assertJsonPath('imageAltDe', null);

        $entry->refresh();
        $this->assertNull($entry->image_id);
        $this->assertNull($entry->image_alt_fr);
        $this->assertNull($entry->image_alt_de);
    }

    public function test_an_unknown_photo_is_refused(): void
    {
        $this->actingAsMember($this->photoEditor())
            ->postJson('/api/v1/history', $this->payload(['imageId' => 999999]))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'imageId');
    }

    public function test_a_photo_that_loses_the_race_to_a_delete_is_refused_on_create_and_update(): void
    {
        $image = $this->image();
        $editor = $this->photoEditor();
        $before = HistoryEntry::query()->count();

        HistoryEntry::creating(function () use ($image): void {
            Image::query()->whereKey($image->id)->delete();
        });
        $this->actingAsMember($editor)
            ->postJson('/api/v1/history', $this->payload(['imageId' => $image->id]))
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'imageId');
        $this->assertSame($before, HistoryEntry::query()->count());

        $other = $this->image('b');
        $entry = HistoryEntry::factory()->create();
        HistoryEntry::updating(function () use ($other): void {
            Image::query()->whereKey($other->id)->delete();
        });
        $this->actingAsMember($editor)
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['imageId' => $other->id]))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'imageId');
        $this->assertNull($entry->fresh()->image_id);
    }

    public function test_attaching_a_photo_needs_images_manage(): void
    {
        $image = $this->image();
        $entry = HistoryEntry::factory()->create(['title_fr' => 'Gardé']);
        $before = HistoryEntry::count();

        $this->actingAsMember($this->historyOnlyEditor())
            ->postJson('/api/v1/history', $this->payload(['imageId' => $image->id]))
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
        $this->assertSame($before, HistoryEntry::count());

        $this->actingAsMember($this->historyOnlyEditor())
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['titleFr' => 'Changé', 'imageId' => $image->id]))
            ->assertStatus(403);
        $this->assertSame('Gardé', $entry->refresh()->title_fr);
        $this->assertNull($entry->image_id);

        // Clearing is a change to the photo too.
        $placed = HistoryEntry::factory()->create(['image_id' => $image->id]);
        $this->actingAsMember($this->historyOnlyEditor())
            ->withHeaders($this->ifMatch('history', $placed))
            ->putJson("/api/v1/history/{$placed->id}", $this->payload(['imageId' => null]))
            ->assertStatus(403);
        $this->assertSame($image->id, $placed->refresh()->image_id);
    }

    public function test_an_entry_saves_without_images_manage_when_no_photo_is_sent(): void
    {
        $image = $this->image();
        $entry = HistoryEntry::factory()->create([
            'image_id' => $image->id, 'image_alt_fr' => 'Le cortège', 'image_alt_de' => 'Der Umzug',
        ]);

        $this->actingAsMember($this->historyOnlyEditor())
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['titleFr' => 'Changé']))
            ->assertOk()
            ->assertJsonPath('titleFr', 'Changé')
            ->assertJsonPath('imageId', $image->id)
            ->assertJsonPath('imageAltFr', 'Le cortège');

        $entry->refresh();
        $this->assertSame($image->id, $entry->image_id);
        $this->assertSame('Der Umzug', $entry->image_alt_de);

        $this->actingAsMember($this->historyOnlyEditor())
            ->postJson('/api/v1/history', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('imageId', null)
            ->assertJsonPath('photo', null);
    }

    public function test_alts_alone_update_the_current_photo(): void
    {
        $image = $this->image();
        $entry = HistoryEntry::factory()->create([
            'image_id' => $image->id, 'image_alt_fr' => 'Avant', 'image_alt_de' => 'Vorher',
        ]);
        $before = EntityTag::compute('history', $entry);

        $this->actingAsMember($this->photoEditor())
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['imageAltFr' => 'Après']))
            ->assertOk()
            ->assertJsonPath('imageId', $image->id)
            ->assertJsonPath('imageAltFr', 'Après')
            ->assertJsonPath('imageAltDe', 'Vorher')
            ->assertJsonPath('photo.altFr', 'Après');

        $entry->refresh();
        $this->assertSame($image->id, $entry->image_id);
        $this->assertSame('Après', $entry->image_alt_fr);
        $this->assertSame('Vorher', $entry->image_alt_de);
        $this->assertNotSame($before, EntityTag::compute('history', $entry));
    }

    public function test_alts_alone_on_an_entry_without_a_photo_stay_null(): void
    {
        $entry = HistoryEntry::factory()->create();

        $this->actingAsMember($this->photoEditor())
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['imageAltFr' => 'Orphelin', 'imageAltDe' => 'Waise']))
            ->assertOk()
            ->assertJsonPath('imageAltFr', null)
            ->assertJsonPath('imageAltDe', null);

        $this->actingAsMember($this->photoEditor())
            ->postJson('/api/v1/history', $this->payload(['imageAltFr' => 'Orphelin']))
            ->assertStatus(201)
            ->assertJsonPath('imageAltFr', null);
    }

    public function test_changing_alts_alone_needs_images_manage(): void
    {
        $entry = HistoryEntry::factory()->create([
            'image_id' => $this->image()->id, 'image_alt_fr' => 'Avant', 'image_alt_de' => null,
        ]);

        $this->actingAsMember($this->historyOnlyEditor())
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['titleFr' => 'Changé', 'imageAltFr' => 'Après']))
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);

        $entry->refresh();
        $this->assertSame('Avant', $entry->image_alt_fr);
        $this->assertNotSame('Changé', $entry->title_fr);
    }

    public function test_the_history_tag_changes_with_the_photo(): void
    {
        $entry = HistoryEntry::factory()->create();
        $before = EntityTag::compute('history', $entry);

        $entry->update(['image_id' => $this->image()->id]);
        $withPhoto = EntityTag::compute('history', $entry->fresh());
        $this->assertNotSame($before, $withPhoto);

        $entry->update(['image_alt_fr' => 'Nouveau']);
        $this->assertNotSame($withPhoto, EntityTag::compute('history', $entry->fresh()));
    }

    public function test_the_public_history_carries_the_photo(): void
    {
        HistoryEntry::query()->delete();
        $image = $this->image();
        HistoryEntry::factory()->create([
            'occurred_on' => '2002-10-01', 'image_id' => $image->id, 'image_alt_fr' => 'Le cortège', 'image_alt_de' => null,
        ]);
        HistoryEntry::factory()->create(['occurred_on' => '2019-01-01']);

        $this->getJson('/api/v1/history')
            ->assertOk()
            ->assertJsonPath('data.0.photo.width', 800)
            ->assertJsonPath('data.0.photo.height', 600)
            ->assertJsonPath('data.0.photo.altFr', 'Le cortège')
            ->assertJsonPath('data.0.photo.altDe', null)
            ->assertJsonPath('data.1.photo', null);

        $photo = $this->getJson('/api/v1/history')->json('data.0.photo');
        $this->assertSame(LibraryImage::url($image, 800), $photo['url']);
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

        foreach ([
            $schemas['HistoryEntryResource']['properties']['imageId'],
            $schemas['StoreHistoryEntryRequest']['properties']['imageId'],
        ] as $property) {
            $types = (array) ($property['type'] ?? []);
            sort($types);
            $this->assertSame(['integer', 'null'], $types, 'imageId is typed differently in the document: '.json_encode($property));
        }
    }
}
