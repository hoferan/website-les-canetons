<?php

namespace Tests\Feature;

use App\Models\ContentBlock;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\Member;
use App\Models\PhotoSlot;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * The public website as one document (#336): what a server hands over to be
 * set up the same on another. The people and the planning stay behind.
 */
class WebsiteExportTest extends TestCase
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
    }

    public function test_export_carries_blocks_images_slots_and_history(): void
    {
        $contact = ['phone' => '026 000 00 03', 'email' => '', 'rows' => [['label' => ['fr' => 'Lieu', 'de' => 'Ort']]]];
        ContentBlock::query()->create(['key' => 'committee.contact', 'data' => $contact]);
        $band = $this->image('a', 'Le groupe');
        $this->place('band', $band, 'Le groupe', '/band');
        // A migration seeds the band's history; this test wants one entry it knows.
        HistoryEntry::query()->delete();
        $entry = HistoryEntry::query()->create([
            'occurred_on' => '2002-01-01', 'precision' => 'year', 'title_fr' => 'Fondation',
            'body_fr' => null, 'title_de' => 'Gründung', 'body_de' => null, 'important' => true, 'icon' => null,
        ]);
        $this->place(PhotoSlot::forHistory($entry->id), $band);

        $body = $this->actingAsMember($this->admin)->getJson('/api/v1/website/export')
            ->assertStatus(200)
            ->assertJsonPath('format', 2)
            ->json();

        $this->assertArrayNotHasKey('texts', $body);
        $this->assertSame([['key' => 'committee.contact', 'data' => $contact]], $body['blocks']);
        $this->assertSame([[
            'sha256' => $band->sha256,
            'name' => 'Le groupe',
            'sizes' => [
                ['width' => 800, 'height' => 600, 'sha256' => $this->sizeSha($band, 800), 'url' => LibraryImage::url($band, 800)],
                ['width' => 480, 'height' => 360, 'sha256' => $this->sizeSha($band, 480), 'url' => LibraryImage::url($band, 480)],
            ],
        ]], $body['images']);
        $this->assertSame([[
            'slot' => 'band', 'sha256' => $band->sha256, 'label' => 'Le groupe', 'path' => '/band', 'registerName' => null,
        ]], $body['slots']);
        $this->assertSame([[
            'occurredOn' => '2002-01-01', 'precision' => 'year', 'titleFr' => 'Fondation', 'bodyFr' => null,
            'titleDe' => 'Gründung', 'bodyDe' => null, 'important' => true, 'icon' => null,
            'photoSha256' => $band->sha256,
        ]], $body['history']);
    }

    public function test_export_names_the_server_it_came_from(): void
    {
        // The importing page shows it, so a file from the wrong server is
        // noticed before it replaces anything.
        $this->actingAsMember($this->admin)->getJson('http://test.lescanetons.ch/api/v1/website/export')
            ->assertOk()
            ->assertJsonPath('exportedFrom', 'test.lescanetons.ch');
    }

    public function test_an_empty_block_is_exported_as_an_object(): void
    {
        // The import, and the SPA's type, want an object; PHP's empty array
        // would encode as a list.
        ContentBlock::query()->create(['key' => 'home.hero', 'data' => []]);

        $json = $this->actingAsMember($this->admin)->getJson('/api/v1/website/export')->assertOk()->getContent();

        $this->assertStringContainsString('"blocks":[{"key":"home.hero","data":{}}]', (string) $json);
    }

    public function test_event_posters_and_history_slots_are_not_slots_in_the_bundle(): void
    {
        $image = $this->image('b');
        $this->place('event-7', $image);
        $this->place('history-3', $image);

        $body = $this->actingAsMember($this->admin)->getJson('/api/v1/website/export')->assertOk()->json();

        $this->assertSame([], $body['slots']);
        // The photo is still in the library, and the library travels whole.
        $this->assertSame([$image->sha256], array_column($body['images'], 'sha256'));
    }

    public function test_a_register_slot_carries_its_register_name(): void
    {
        $bells = Section::query()->where('name', 'Cloches')->sole();
        $image = $this->image('c');
        $this->place("register-{$bells->id}", $image, 'Cloches', '/band');

        $body = $this->actingAsMember($this->admin)->getJson('/api/v1/website/export')->assertOk()->json();

        $this->assertSame('Cloches', $body['slots'][0]['registerName']);
    }

    public function test_export_needs_all_three_permissions(): void
    {
        $this->getJson('/api/v1/website/export')->assertStatus(401);

        foreach ([
            [Permission::ContentManage, Permission::ImagesManage],
            [Permission::ContentManage, Permission::HistoryManage],
            [Permission::ImagesManage, Permission::HistoryManage],
        ] as $two) {
            $member = Member::factory()->withRole(Role::factory()->granting(...$two)->create())->create();
            $this->actingAsMember($member)->getJson('/api/v1/website/export')
                ->assertStatus(403)->assertJson(['code' => 'access_denied']);
        }
    }

    private function image(string $seed, string $name = 'Photo de test'): Image
    {
        return LibraryImage::create(str_repeat($seed, 64), 800, 600, [800, 480], name: $name);
    }

    private function place(string $slot, Image $image, ?string $label = null, ?string $path = null): void
    {
        PhotoSlot::query()->insert(['slot' => $slot, 'image_id' => $image->id, 'label' => $label, 'path' => $path, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function sizeSha(Image $image, int $width): string
    {
        return (string) $image->sizes->firstWhere('width', $width)?->sha256;
    }
}
