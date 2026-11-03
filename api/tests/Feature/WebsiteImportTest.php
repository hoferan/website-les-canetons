<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\ContentBlock;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\Member;
use App\Models\PhotoSlot;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * Setting a server's website up from another's (#336): the content blocks,
 * the photo slots and the history are replaced together or not at all. The
 * photos are uploaded first, through the library, so the import refers to
 * them by SHA-256 only.
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

    public function test_import_replaces_blocks_slots_and_history(): void
    {
        $old = $this->image('a');
        $new = $this->image('b');
        $this->block('join.facts', ['title' => 'Ancien']);
        $this->place('band', $old);
        $this->place('concert', $old);
        $oldEntry = $this->entry('Ancienne entrée');
        $this->place(PhotoSlot::forHistory($oldEntry->id), $old);
        // An empty string is a value a block keeps: a number not known yet.
        $contact = ['phone' => '026 000 00 03', 'email' => '', 'rows' => [['label' => ['fr' => 'Lieu', 'de' => 'Ort']]]];

        $this->import([
            'blocks' => [['key' => 'committee.contact', 'data' => $contact]],
            'slots' => [$this->slot('band', $new, 'Le groupe', '/band')],
            'history' => [$this->historyRow('Fondation', $new->sha256)],
        ])->assertStatus(200)
            ->assertJsonPath('blocks', 1)
            ->assertJsonPath('slots', 1)
            ->assertJsonPath('history', 1)
            ->assertJsonPath('skipped', []);

        $this->assertSame(['committee.contact'], ContentBlock::query()->pluck('key')->all());
        $this->assertSame($contact, ContentBlock::query()->findOrFail('committee.contact')->data);
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

        $this->import(['blocks' => [], 'slots' => [], 'history' => []])->assertOk();

        $this->assertSame($poster->id, PhotoSlot::query()->findOrFail('event-7')->image_id);
    }

    public function test_a_register_slot_lands_on_the_register_of_that_name(): void
    {
        $bells = Section::query()->where('name', 'Cloches')->sole();
        $image = $this->image('d');

        $this->import([
            'blocks' => [],
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
            'blocks' => [],
            'slots' => [$this->slot('register-3', $image, 'Tubas', '/band', 'Tubas')],
            'history' => [],
        ])->assertOk()
            ->assertJsonPath('slots', 0)
            ->assertJsonPath('skipped', [['slot' => 'register-3', 'registerName' => 'Tubas']]);
    }

    public function test_an_unknown_photo_is_refused_and_nothing_changes(): void
    {
        $this->block('join.facts', ['title' => 'Ancien']);

        $this->import([
            'blocks' => [['key' => 'join.facts', 'data' => ['title' => 'Nouveau']]],
            'slots' => [['slot' => 'band', 'sha256' => str_repeat('f', 64), 'label' => null, 'path' => null, 'registerName' => null]],
            'history' => [],
        ])->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'slots.0.sha256');

        $this->assertSame(['title' => 'Ancien'], ContentBlock::query()->findOrFail('join.facts')->data);
    }

    public function test_an_invalid_history_row_changes_nothing(): void
    {
        $this->block('join.facts', ['title' => 'Ancien']);
        $kept = $this->entry('Gardée');
        $row = $this->historyRow('x', null);
        $row['precision'] = 'decade';

        $this->import([
            'blocks' => [['key' => 'join.facts', 'data' => ['title' => 'Nouveau']]],
            'slots' => [],
            'history' => [$row],
        ])->assertStatus(400)->assertJsonPath('errors.0.field', 'history.0.precision');

        $this->assertSame(['title' => 'Ancien'], ContentBlock::query()->findOrFail('join.facts')->data);
        $this->assertNotNull(HistoryEntry::query()->find($kept->id));
    }

    public function test_a_failure_inside_the_transaction_changes_nothing(): void
    {
        // Past validation: the blocks and slots are already rewritten when the
        // history insert fails, so only the transaction stands between PROD
        // and a half-replaced site.
        $image = $this->image('j');
        $this->block('join.facts', ['title' => 'Ancien']);
        $this->place('band', $image);
        $kept = $this->entry('Gardée');
        HistoryEntry::creating(fn () => throw new RuntimeException('disk full'));

        try {
            $this->withoutExceptionHandling();
            $this->import([
                'blocks' => [['key' => 'join.facts', 'data' => ['title' => 'Nouveau']]],
                'slots' => [],
                'history' => [$this->historyRow('Nouvelle', null)],
            ]);
            $this->fail('The import should have failed.');
        } catch (RuntimeException $e) {
            $this->assertSame('disk full', $e->getMessage());
        } finally {
            HistoryEntry::flushEventListeners();
        }

        $this->assertSame(['title' => 'Ancien'], ContentBlock::query()->findOrFail('join.facts')->data);
        $this->assertSame($image->id, PhotoSlot::query()->findOrFail('band')->image_id);
        $this->assertNotNull(HistoryEntry::query()->find($kept->id));
    }

    public function test_a_block_or_slot_named_twice_is_refused(): void
    {
        $image = $this->image('k');

        $this->import([
            'blocks' => [
                ['key' => 'join.facts', 'data' => ['title' => 'Un']],
                ['key' => 'join.facts', 'data' => ['title' => 'Deux']],
            ],
            'slots' => [],
            'history' => [],
        ])->assertStatus(400)->assertJsonPath('errors.0.field', 'blocks.0.key');

        $this->import([
            'blocks' => [],
            'slots' => [$this->slot('band', $image), $this->slot('band', $image)],
            'history' => [],
        ])->assertStatus(400)->assertJsonPath('errors.0.field', 'slots.0.slot');
    }

    public function test_a_block_key_the_page_route_refuses_is_refused(): void
    {
        foreach (['Join.Facts', 'join..facts', str_repeat('a', ContentBlock::MAX_KEY_LENGTH + 1)] as $key) {
            $this->import([
                'blocks' => [['key' => $key, 'data' => ['title' => 'x']]],
                'slots' => [],
                'history' => [],
            ])->assertStatus(400)->assertJsonPath('errors.0.field', 'blocks.0.key');
        }

        $this->assertSame(0, ContentBlock::query()->count());
    }

    public function test_a_block_of_the_wrong_shape_refuses_the_import(): void
    {
        $this->block('join.facts', ['title' => 'Ancien']);

        // The limits of PUT /blocks/{key}: a list, an over-long string, a bad
        // key, and a value that is no object at all.
        foreach ([['a', 'b'], ['title' => str_repeat('x', 2001)], ['1x' => 'x'], 'a string'] as $data) {
            $this->import([
                'blocks' => [['key' => 'join.facts', 'data' => $data]],
                'slots' => [],
                'history' => [],
            ])->assertStatus(400)
                ->assertJsonPath('code', 'validation_failed')
                ->assertJsonPath('errors.0.field', 'blocks.0.data');
        }

        $this->assertSame(['title' => 'Ancien'], ContentBlock::query()->findOrFail('join.facts')->data);
    }

    public function test_a_format_1_bundle_is_refused(): void
    {
        // Format 1 carried single texts, which this server no longer stores.
        $this->actingAsMember($this->admin)
            ->postJson('/api/v1/website/import', ['format' => 1, 'texts' => [], 'slots' => [], 'history' => []])
            ->assertStatus(400)->assertJsonPath('errors.0.field', 'format');
    }

    public function test_importing_twice_gives_the_same_site(): void
    {
        $image = $this->image('h');
        $bundle = [
            'blocks' => [['key' => 'join.facts', 'data' => ['title' => ['fr' => 'Bonjour', 'de' => 'Hallo']]]],
            'slots' => [$this->slot('band', $image)],
            'history' => [$this->historyRow('Fondation', $image->sha256)],
        ];

        $this->import($bundle)->assertOk();
        $this->import($bundle)->assertOk();

        $this->assertSame(1, ContentBlock::query()->count());
        $this->assertSame(1, HistoryEntry::query()->count());
        $this->assertSame(2, PhotoSlot::query()->count());
    }

    public function test_import_never_deletes_a_library_photo(): void
    {
        $unused = $this->image('i');

        $this->import(['blocks' => [], 'slots' => [], 'history' => []])->assertOk();

        $this->assertNotNull(Image::query()->find($unused->id));
    }

    public function test_import_needs_all_three_permissions(): void
    {
        $body = ['format' => 2, 'blocks' => [], 'slots' => [], 'history' => []];
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
            ->postJson('/api/v1/website/import', ['format' => 2, ...$bundle]);
    }

    /** @param array<string, mixed> $data */
    private function block(string $key, array $data): void
    {
        ContentBlock::query()->create(['key' => $key, 'data' => $data]);
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
