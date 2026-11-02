<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\Member;
use App\Models\PhotoSlot;
use App\Models\Role;
use App\Models\Section;
use App\Models\TextOverride;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * Setting a server's website up from another's (#336): the texts, the photo
 * slots and the history are replaced together or not at all. The photos are
 * uploaded first, through the library, so the import refers to them by
 * SHA-256 only.
 */
class WebsiteImportTest extends TestCase
{
    use RefreshDatabase;

    private Member $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = Member::factory()
            ->withRole(Role::factory()->granting(
                Permission::ContentManage,
                Permission::ImagesManage,
                Permission::HistoryManage,
            )->create())
            ->create();
        HistoryEntry::query()->delete();
    }

    public function test_import_replaces_texts_slots_and_history(): void
    {
        $old = $this->image('a');
        $new = $this->image('b');
        TextOverride::query()->create(['key' => 'join.intro', 'fr' => 'Ancien', 'de' => null]);
        $this->place('band', $old);
        $this->place('concert', $old);
        $oldEntry = $this->entry('Ancienne entrée');
        $this->place(PhotoSlot::forHistory($oldEntry->id), $old);

        $this->import([
            'texts' => [['key' => 'committee.bookingNumber', 'fr' => '026 000 00 03', 'de' => '026 000 00 03']],
            'slots' => [$this->slot('band', $new, 'Le groupe', '/band')],
            'history' => [$this->historyRow('Fondation', $new->sha256)],
        ])->assertStatus(200)
            ->assertJsonPath('texts', 1)
            ->assertJsonPath('slots', 1)
            ->assertJsonPath('history', 1)
            ->assertJsonPath('skipped', []);

        $this->assertSame(['committee.bookingNumber'], TextOverride::query()->pluck('key')->all());
        $this->assertSame($new->id, PhotoSlot::query()->findOrFail('band')->image_id);
        $this->assertNull(PhotoSlot::query()->find('concert'));
        $this->assertNull(HistoryEntry::query()->find($oldEntry->id));
        $this->assertNull(PhotoSlot::query()->find(PhotoSlot::forHistory($oldEntry->id)));

        $entry = HistoryEntry::query()->sole();
        $this->assertSame('Fondation', $entry->title_fr);
        $this->assertSame($new->id, PhotoSlot::query()->findOrFail(PhotoSlot::forHistory($entry->id))->image_id);
        $this->assertSame(1, AuditEntry::query()->where('action', 'website.imported')->count());
    }

    public function test_event_posters_survive_an_import(): void
    {
        $poster = $this->image('c');
        $this->place('event-7', $poster);

        $this->import(['texts' => [], 'slots' => [], 'history' => []])->assertOk();

        $this->assertSame($poster->id, PhotoSlot::query()->findOrFail('event-7')->image_id);
    }

    public function test_a_register_slot_lands_on_the_register_of_that_name(): void
    {
        $bells = Section::query()->where('name', 'Cloches')->sole();
        $image = $this->image('d');

        $this->import([
            'texts' => [],
            'slots' => [$this->slot('register-999', $image, 'Cloches', '/band', 'Cloches')],
            'history' => [],
        ])->assertOk()->assertJsonPath('slots', 1);

        $this->assertSame($image->id, PhotoSlot::query()->findOrFail("register-{$bells->id}")->image_id);
        $this->assertNull(PhotoSlot::query()->find('register-999'));
    }

    public function test_a_register_slot_with_no_such_register_is_skipped_and_reported(): void
    {
        $image = $this->image('e');

        $this->import([
            'texts' => [],
            'slots' => [$this->slot('register-3', $image, 'Tubas', '/band', 'Tubas')],
            'history' => [],
        ])->assertOk()
            ->assertJsonPath('slots', 0)
            ->assertJsonPath('skipped', [['slot' => 'register-3', 'registerName' => 'Tubas']]);
    }

    public function test_an_unknown_photo_is_refused_and_nothing_changes(): void
    {
        TextOverride::query()->create(['key' => 'join.intro', 'fr' => 'Ancien', 'de' => null]);

        $this->import([
            'texts' => [['key' => 'join.intro', 'fr' => 'Nouveau', 'de' => null]],
            'slots' => [['slot' => 'band', 'sha256' => str_repeat('f', 64), 'label' => null, 'path' => null, 'registerName' => null]],
            'history' => [],
        ])->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'slots.0.sha256');

        $this->assertSame('Ancien', TextOverride::query()->findOrFail('join.intro')->fr);
    }

    public function test_an_invalid_history_row_changes_nothing(): void
    {
        TextOverride::query()->create(['key' => 'join.intro', 'fr' => 'Ancien', 'de' => null]);
        $kept = $this->entry('Gardée');
        $row = $this->historyRow('x', null);
        $row['precision'] = 'decade';

        $this->import([
            'texts' => [['key' => 'join.intro', 'fr' => 'Nouveau', 'de' => null]],
            'slots' => [],
            'history' => [$row],
        ])->assertStatus(400)->assertJsonPath('errors.0.field', 'history.0.precision');

        $this->assertSame('Ancien', TextOverride::query()->findOrFail('join.intro')->fr);
        $this->assertNotNull(HistoryEntry::query()->find($kept->id));
    }

    public function test_event_and_history_slots_cannot_be_imported_as_slots(): void
    {
        $image = $this->image('g');

        foreach (['event-3', 'history-4'] as $slot) {
            $this->import(['texts' => [], 'slots' => [$this->slot($slot, $image)], 'history' => []])
                ->assertStatus(400)->assertJsonPath('errors.0.field', 'slots.0.slot');
        }
    }

    public function test_another_format_is_refused(): void
    {
        $this->actingAsMember($this->admin)
            ->postJson('/api/v1/website/import', ['format' => 2, 'texts' => [], 'slots' => [], 'history' => []])
            ->assertStatus(400)->assertJsonPath('errors.0.field', 'format');
    }

    public function test_importing_twice_gives_the_same_site(): void
    {
        $image = $this->image('h');
        $bundle = [
            'texts' => [['key' => 'join.intro', 'fr' => 'Bonjour', 'de' => 'Hallo']],
            'slots' => [$this->slot('band', $image)],
            'history' => [$this->historyRow('Fondation', $image->sha256)],
        ];

        $this->import($bundle)->assertOk();
        $this->import($bundle)->assertOk();

        $this->assertSame(1, TextOverride::query()->count());
        $this->assertSame(1, HistoryEntry::query()->count());
        $this->assertSame(2, PhotoSlot::query()->count());
    }

    public function test_import_never_deletes_a_library_photo(): void
    {
        $unused = $this->image('i');

        $this->import(['texts' => [], 'slots' => [], 'history' => []])->assertOk();

        $this->assertNotNull(Image::query()->find($unused->id));
    }

    public function test_import_needs_all_three_permissions(): void
    {
        $body = ['format' => 1, 'texts' => [], 'slots' => [], 'history' => []];
        $this->postJson('/api/v1/website/import', $body)->assertStatus(401);

        $two = Member::factory()
            ->withRole(Role::factory()->granting(Permission::ContentManage, Permission::ImagesManage)->create())
            ->create();
        $this->actingAsMember($two)->postJson('/api/v1/website/import', $body)
            ->assertStatus(403)->assertJson(['code' => 'access_denied']);
    }

    /** @param array<string, mixed> $bundle */
    private function import(array $bundle): TestResponse
    {
        return $this->actingAsMember($this->admin)
            ->postJson('/api/v1/website/import', ['format' => 1, ...$bundle]);
    }

    private function image(string $seed): Image
    {
        return LibraryImage::create(str_repeat($seed, 64), 800, 600, [800, 480]);
    }

    private function place(string $slot, Image $image): void
    {
        PhotoSlot::query()->insert(['slot' => $slot, 'image_id' => $image->id, 'label' => null, 'path' => null, 'created_at' => now(), 'updated_at' => now()]);
    }

    /** @return array<string, mixed> */
    private function slot(string $slot, Image $image, ?string $label = null, ?string $path = null, ?string $registerName = null): array
    {
        return ['slot' => $slot, 'sha256' => $image->sha256, 'label' => $label, 'path' => $path, 'registerName' => $registerName];
    }

    private function entry(string $title): HistoryEntry
    {
        return HistoryEntry::query()->create([
            'occurred_on' => '2010-01-01', 'precision' => 'year', 'title_fr' => $title,
            'body_fr' => null, 'title_de' => null, 'body_de' => null, 'important' => false, 'icon' => null,
        ]);
    }

    /** @return array<string, mixed> */
    private function historyRow(string $title, ?string $photo): array
    {
        return [
            'occurredOn' => '2002-01-01', 'precision' => 'year', 'titleFr' => $title, 'bodyFr' => null,
            'titleDe' => null, 'bodyDe' => null, 'important' => true, 'icon' => null, 'photoSha256' => $photo,
        ];
    }
}
