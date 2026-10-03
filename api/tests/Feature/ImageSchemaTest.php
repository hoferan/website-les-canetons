<?php

namespace Tests\Feature;

use App\Models\Image;
use App\Models\PhotoSlot;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The image library's schema (#105): a photo table with its sizes beside it,
 * and one table of photo slots that points at it with RESTRICT.
 */
class ImageSchemaTest extends TestCase
{
    use RefreshDatabase;

    private function image(): Image
    {
        return Image::query()->create([
            'name' => 'Photo',
            'sha256' => hash('sha256', uniqid('', true)),
            'width' => 800,
            'height' => 600,
            'bytes' => 12345,
        ]);
    }

    public function test_the_bytes_column_is_a_mediumblob_that_holds_a_full_size(): void
    {
        // Laravel's binary() is a BLOB on MySQL, 64 KB at most. A photo size
        // is up to 600 KB, and MariaDB in strict mode refuses the longer
        // write, or in a lax one cuts it short without a word.
        $type = DB::selectOne(
            'SELECT DATA_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            ['image_files', 'data'],
        );
        $this->assertSame('mediumblob', strtolower((string) $type?->type));

        $image = $this->image();
        $bytes = random_bytes(614400);
        DB::table('image_files')->insert([
            'image_id' => $image->id, 'width' => 1920, 'height' => 1280, 'bytes' => strlen($bytes),
            'sha256' => hash('sha256', $bytes), 'data' => $bytes,
        ]);

        $this->assertSame($bytes, DB::table('image_files')->where('image_id', $image->id)->value('data'));
    }

    public function test_a_size_is_looked_up_by_the_indexed_digest_of_its_bytes(): void
    {
        // The file route finds a size by this column alone, so it must be
        // indexed. Not unique: two rows holding the same bytes answer alike.
        $index = DB::selectOne(
            'SELECT NON_UNIQUE AS non_unique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND SEQ_IN_INDEX = 1',
            ['image_files', 'sha256'],
        );

        $this->assertNotNull($index, 'image_files.sha256 is not the first column of any index.');
        $this->assertSame('1', (string) $index->non_unique);
    }

    public function test_a_size_is_keyed_by_photo_and_width_and_goes_with_its_photo(): void
    {
        $image = $this->image();
        $size = ['image_id' => $image->id, 'width' => 480, 'height' => 360, 'bytes' => 1, 'sha256' => hash('sha256', 'x'), 'data' => 'x'];
        DB::table('image_files')->insert($size);

        $this->assertThrows(fn () => DB::table('image_files')->insert($size), QueryException::class);

        $image->delete();
        $this->assertSame(0, DB::table('image_files')->count());
    }

    public function test_a_photo_slot_is_a_named_row_that_always_shows_an_image(): void
    {
        $columns = collect(DB::select(
            'SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_KEY AS col_key
               FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            ['photo_slots'],
        ))->keyBy('name');

        $this->assertEqualsCanonicalizing(
            ['slot', 'image_id', 'label', 'path', 'created_at', 'updated_at'],
            $columns->keys()->all(),
        );

        $shape = fn (string $name) => [
            strtolower((string) $columns[$name]->type),
            $columns[$name]->nullable,
        ];
        $this->assertSame(['varchar(64)', 'NO'], $shape('slot'));
        $this->assertSame('PRI', $columns['slot']->col_key);
        $this->assertSame(['bigint(20) unsigned', 'NO'], $shape('image_id'));
        $this->assertSame(['varchar(120)', 'YES'], $shape('label'));
        $this->assertSame(['varchar(255)', 'YES'], $shape('path'));

        $this->assertRestrictKey();
    }

    public function test_the_migration_inserts_no_slot(): void
    {
        // A slot's row is made by its first placement, so a new slot needs no
        // migration. PhotoSlotTest pins the placement side.
        $this->assertSame(0, PhotoSlot::query()->count());
    }

    public function test_no_other_table_places_a_photo(): void
    {
        foreach (['sections', 'history_entries', 'members'] as $table) {
            $this->assertFalse(Schema::hasColumn($table, 'image_id'), "{$table} places a photo of its own again.");
        }
        $this->assertFalse(Schema::hasTable('site_photos'));
        $this->assertFalse(Schema::hasColumn('photo_slots', 'image_alt_fr'), 'A slot carries alt text again.');
    }

    public function test_deleting_a_placed_image_is_refused_by_the_database(): void
    {
        $image = $this->image();
        $this->placePhoto('band', $image->id);

        $this->assertThrows(fn () => $image->delete(), QueryException::class);
        $this->assertTrue(Image::query()->whereKey($image->id)->exists());

        // A slot cannot name an image that does not exist either.
        $this->assertThrows(fn () => $this->placePhoto('concert', 424242), QueryException::class);
    }

    public function test_usages_name_every_slot_by_its_page_s_name(): void
    {
        $image = $this->image();
        $this->placePhoto('register-5', $image->id, 'Batteurs', '/band');
        $this->placePhoto('band', $image->id);
        $this->placePhoto('history-12', $this->image()->id, 'La fondation', '/history');

        $this->assertSame([
            ['slot' => 'band', 'label' => null, 'path' => null],
            ['slot' => 'register-5', 'label' => 'Batteurs', 'path' => '/band'],
        ], $image->usages());
        $this->assertTrue($image->isUsed());
        $this->assertFalse($this->image()->isUsed());
    }

    public function test_the_migrations_are_safe_to_rerun(): void
    {
        foreach ([
            '2026_10_02_000001_create_images_table',
            '2026_10_02_000002_create_photo_slots_table',
            '2026_10_02_000003_grant_images_manage',
        ] as $file) {
            (require database_path("migrations/{$file}.php"))->up();
            (require database_path("migrations/{$file}.php"))->up();
        }

        $this->assertSame(0, PhotoSlot::query()->count());
        $this->assertRestrictKey();
    }

    public function test_a_run_cut_off_between_the_table_and_its_key_adds_the_key_next_time(): void
    {
        // MariaDB commits each DDL statement on its own, so a worker killed
        // after the table and before the key leaves exactly this behind.
        Schema::table('photo_slots', fn (Blueprint $blueprint) => $blueprint->dropForeign(['image_id']));
        $this->assertNull($this->imageKey(), 'photo_slots still has its key; this test would prove nothing.');

        $this->runSlotsMigration();

        $this->assertRestrictKey();
    }

    public function test_a_run_cut_off_before_the_table_makes_the_table_and_its_key(): void
    {
        Schema::drop('photo_slots');
        $this->assertFalse(Schema::hasTable('photo_slots'));

        $this->runSlotsMigration();

        $this->assertTrue(Schema::hasTable('photo_slots'));
        $this->assertRestrictKey();

        // And the key is a real one: a placed image cannot be deleted.
        $image = $this->image();
        $this->placePhoto('band', $image->id);
        $this->assertThrows(fn () => $image->delete(), QueryException::class);

        // Created after the DDL above committed, so no transaction removes it.
        PhotoSlot::query()->whereKey('band')->delete();
        $image->delete();
    }

    protected function tearDown(): void
    {
        // DDL implicitly commits on MariaDB, so RefreshDatabase's transaction
        // cannot put back a table or a key a test dropped. The migration
        // itself can, and on an intact schema it changes nothing.
        $this->runSlotsMigration();

        parent::tearDown();
    }

    private function runSlotsMigration(): void
    {
        (require database_path('migrations/2026_10_02_000002_create_photo_slots_table.php'))->up();
    }

    /** @return array<string, mixed>|null */
    private function imageKey(): ?array
    {
        foreach (Schema::getForeignKeys('photo_slots') as $key) {
            if ($key['columns'] === ['image_id']) {
                return $key;
            }
        }

        return null;
    }

    private function assertRestrictKey(): void
    {
        $key = $this->imageKey();

        $this->assertNotNull($key, 'photo_slots.image_id has no foreign key.');
        $this->assertSame('images', $key['foreign_table']);
        $this->assertSame(['id'], $key['foreign_columns']);
        $this->assertSame('restrict', strtolower((string) $key['on_delete']));
    }
}
