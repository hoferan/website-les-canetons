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
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\Support\JpegBytes;
use Tests\TestCase;

/**
 * A website exported, imported into an empty server and exported again
 * comes out the same (#336, ADR 0039). The export and the import are each
 * tested against fixtures written by hand; this feeds one's real answer to
 * the other, the way the /website page does.
 */
class WebsiteRoundTripTest extends TestCase
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
        // A migration seeds the band's history; this test wants entries it knows.
        HistoryEntry::query()->delete();
    }

    public function test_an_exported_website_imported_into_an_empty_server_exports_the_same(): void
    {
        $group = $this->uploadPhoto('Le groupe', 1920, 1280);
        $bells = $this->uploadPhoto('Les cloches', 1280, 1920);

        // An empty block, and blank strings: values a block keeps as they are.
        ContentBlock::query()->create(['key' => 'join.hero', 'data' => []]);
        ContentBlock::query()->create(['key' => 'committee.contact', 'data' => ['cards' => [[
            'id' => 'contact',
            'icon' => 'phone',
            'tint' => 'yellow',
            'title' => ['fr' => 'Contact', 'de' => ''],
            'rows' => [['type' => 'phone', 'label' => ['fr' => 'Réservations'], 'number' => '', 'tbd' => 'booking-number']],
        ]]]]);

        $register = Section::query()->where('name', 'Cloches')->sole();
        $this->place("register-{$register->id}", $bells, 'Cloches', '/band');
        $this->place('band', $group, 'Le groupe', '/band');
        $this->place('home-hero', $group, null, null);
        // Not part of the website, so neither exported nor touched.
        $this->place('event-7', $bells, null, null);

        $founding = HistoryEntry::query()->create([
            'occurred_on' => '2002-01-01', 'precision' => 'year', 'title_fr' => 'Fondation',
            'body_fr' => 'Au Werkhof.', 'title_de' => 'Gründung', 'body_de' => null, 'important' => true, 'icon' => null,
        ]);
        $this->place(PhotoSlot::forHistory($founding->id), $group, null, null);
        HistoryEntry::query()->create([
            'occurred_on' => '2015-02-01', 'precision' => 'month', 'title_fr' => 'Premier souper',
            'body_fr' => null, 'title_de' => null, 'body_de' => null, 'important' => false, 'icon' => 'music',
        ]);

        $first = $this->export();

        // The page downloads every size by its URL first. The bytes are read
        // from the table that URL serves, because the file route disconnects
        // from the database, which would roll this test's transaction back;
        // ImageFileTest covers the route itself.
        $bytes = [];
        foreach ($first->images as $image) {
            foreach ($image->sizes as $size) {
                $this->assertSame("/api/v1/images/{$size->sha256}.jpg", $size->url);
                $bytes[$size->sha256] = (string) DB::table('image_files')->where('sha256', $size->sha256)->value('data');
            }
        }

        // An empty server: no website and no library. Event posters stay out
        // of it, so the poster goes too.
        PhotoSlot::query()->delete();
        ContentBlock::query()->delete();
        HistoryEntry::query()->delete();
        DB::table('image_files')->delete();
        Image::query()->delete();

        // What importRunner does: upload each photo the library lacks, its
        // sizes largest first, under its name; then send the rest, with
        // registerName only on a register's photo.
        foreach ($first->images as $image) {
            $sizes = $image->sizes;
            usort($sizes, fn (object $a, object $b): int => $b->width <=> $a->width);
            $this->actingAsMember($this->admin)->post('/api/v1/images', [
                'name' => $image->name,
                'files' => array_map(
                    fn (object $size): UploadedFile => UploadedFile::fake()->createWithContent('blob.jpg', $bytes[$size->sha256]),
                    $sizes,
                ),
            ], ['Accept' => 'application/json'])->assertStatus(201);
        }

        $body = json_decode((string) json_encode($first), true);
        $this->actingAsMember($this->admin)->postJson('/api/v1/website/import', [
            'format' => $body['format'],
            'blocks' => $body['blocks'],
            'slots' => array_map(
                fn (array $slot): array => $slot['registerName'] === null ? array_diff_key($slot, ['registerName' => true]) : $slot,
                $body['slots'],
            ),
            'history' => $body['history'],
        ])->assertOk()->assertJsonPath('skipped', []);

        $second = $this->export();

        // Compared as JSON, so `{}` and `[]` stay apart.
        $this->assertSame(json_encode($first, JSON_PRETTY_PRINT), json_encode($second, JSON_PRETTY_PRINT));
        // And the cases the comparison exists for are in it.
        $this->assertStringContainsString('"key":"join.hero","data":{}', (string) json_encode($second->blocks));
        $this->assertStringContainsString('"de":""', (string) json_encode($second->blocks));
        $this->assertCount(2, $second->images);
        $this->assertContains('register-'.$register->id, array_column($second->slots, 'slot'));
        $this->assertCount(2, $second->history);
    }

    /** The export as the page reads it, less what names the moment and the host. */
    private function export(): object
    {
        $body = json_decode($this->actingAsMember($this->admin)->getJson('/api/v1/website/export')
            ->assertOk()->getContent());
        $this->assertIsObject($body);
        unset($body->exportedAt, $body->exportedFrom);

        return $body;
    }

    /** A photo uploaded as /media uploads one: three sizes, largest first. */
    private function uploadPhoto(string $name, int $width, int $height): Image
    {
        $files = [];
        foreach ([1, 2, 4] as $divisor) {
            $files[] = UploadedFile::fake()->createWithContent(
                "blob-{$divisor}.jpg",
                JpegBytes::make(intdiv($width, $divisor), intdiv($height, $divisor)),
            );
        }

        $id = $this->actingAsMember($this->admin)->post('/api/v1/images', ['name' => $name, 'files' => $files], ['Accept' => 'application/json'])
            ->assertStatus(201)->json('id');

        return Image::query()->findOrFail($id);
    }

    private function place(string $slot, Image $image, ?string $label, ?string $path): void
    {
        PhotoSlot::query()->insert([
            'slot' => $slot, 'image_id' => $image->id, 'label' => $label, 'path' => $path,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
