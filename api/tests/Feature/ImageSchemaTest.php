<?php

namespace Tests\Feature;

use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\Section;
use App\Models\SitePhoto;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The image library's schema (#105): a photo table with its sizes beside it,
 * and three kinds of placement that all point at it with RESTRICT.
 */
class ImageSchemaTest extends TestCase
{
    use RefreshDatabase;

    /** Every table that places a photo with an `image_id`. */
    private const PLACEMENT_TABLES = ['sections', 'history_entries', 'site_photos'];

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

    public function test_both_site_photo_slots_exist(): void
    {
        $this->assertSame(['band', 'concert'], SitePhoto::query()->orderBy('slot')->pluck('slot')->all());
    }

    public function test_deleting_a_placed_image_is_refused_by_the_database(): void
    {
        $placements = [
            fn (Image $i) => Section::factory()->create(['image_id' => $i->id]),
            fn (Image $i) => HistoryEntry::factory()->create(['image_id' => $i->id]),
            fn (Image $i) => SitePhoto::query()->where('slot', 'band')->update(['image_id' => $i->id]),
        ];

        foreach ($placements as $place) {
            $image = $this->image();
            $place($image);

            $this->assertThrows(fn () => $image->delete(), QueryException::class);
            $this->assertTrue(Image::query()->whereKey($image->id)->exists());
        }
    }

    public function test_usages_name_every_placement(): void
    {
        $image = $this->image();
        $section = Section::query()->where('name', 'Cloches')->firstOrFail();
        $section->update(['image_id' => $image->id]);
        $entry = HistoryEntry::factory()->create([
            'image_id' => $image->id,
            'title_fr' => null,
            'title_de' => 'Gründung',
        ]);
        SitePhoto::query()->where('slot', 'band')->update(['image_id' => $image->id]);

        $usages = $image->usages();

        $this->assertCount(3, $usages);
        $this->assertContains(['kind' => 'band', 'id' => null, 'label' => null], $usages);
        $this->assertContains(['kind' => 'register', 'id' => $section->id, 'label' => 'Cloches'], $usages);
        $this->assertContains(['kind' => 'history', 'id' => $entry->id, 'label' => 'Gründung'], $usages);
        $this->assertTrue($image->isUsed());
        $this->assertFalse($this->image()->isUsed());
    }

    public function test_no_placement_carries_alt_text_and_a_member_has_no_photo(): void
    {
        foreach (self::PLACEMENT_TABLES as $table) {
            $this->assertTrue(Schema::hasColumn($table, 'image_id'), "{$table} lost its image_id.");
            $this->assertFalse(Schema::hasColumn($table, 'image_alt_fr'), "{$table} carries alt text again.");
            $this->assertFalse(Schema::hasColumn($table, 'image_alt_de'), "{$table} carries alt text again.");
        }

        $this->assertFalse(Schema::hasColumn('members', 'image_id'));
    }

    public function test_the_migrations_are_safe_to_rerun(): void
    {
        foreach ([
            '2026_10_02_000001_create_images_table',
            '2026_10_02_000002_add_image_placements',
            '2026_10_02_000003_grant_images_manage',
        ] as $file) {
            (require database_path("migrations/{$file}.php"))->up();
            (require database_path("migrations/{$file}.php"))->up();
        }

        $this->assertSame(2, DB::table('site_photos')->count());
    }

    public function test_a_run_cut_off_between_a_column_and_its_key_adds_the_key_next_time(): void
    {
        // MariaDB commits each DDL statement on its own, so a worker killed
        // after the column and before the key leaves exactly this behind.
        foreach (self::PLACEMENT_TABLES as $table) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropForeign(['image_id']));
        }
        foreach (self::PLACEMENT_TABLES as $table) {
            $this->assertTrue(Schema::hasColumn($table, 'image_id'));
            $this->assertNull($this->imageKey($table), "{$table} still has its key; this test would prove nothing.");
        }

        $this->runPlacementsMigration();

        foreach (self::PLACEMENT_TABLES as $table) {
            $this->assertRestrictKey($table);
        }
    }

    public function test_a_run_cut_off_before_the_column_adds_the_column_and_the_key(): void
    {
        Schema::table('history_entries', function (Blueprint $blueprint) {
            $blueprint->dropForeign(['image_id']);
        });
        Schema::table('history_entries', function (Blueprint $blueprint) {
            $blueprint->dropColumn('image_id');
        });
        $this->assertFalse(Schema::hasColumn('history_entries', 'image_id'));

        $this->runPlacementsMigration();

        $this->assertTrue(Schema::hasColumn('history_entries', 'image_id'));
        $this->assertRestrictKey('history_entries');

        // And the key is a real one: a placed image cannot be deleted.
        $image = $this->image();
        $entry = HistoryEntry::factory()->create(['image_id' => $image->id]);
        $this->assertThrows(fn () => $image->delete(), QueryException::class);

        // Created after the DDL above committed, so no transaction removes it.
        $entry->delete();
        $image->delete();
    }

    protected function tearDown(): void
    {
        // DDL implicitly commits on MariaDB, so RefreshDatabase's transaction
        // cannot put back a key or a column a test dropped. The migration
        // itself can, and on an intact schema it changes nothing.
        $this->runPlacementsMigration();

        parent::tearDown();
    }

    private function runPlacementsMigration(): void
    {
        (require database_path('migrations/2026_10_02_000002_add_image_placements.php'))->up();
    }

    /** @return array<string, mixed>|null */
    private function imageKey(string $table): ?array
    {
        foreach (Schema::getForeignKeys($table) as $key) {
            if ($key['columns'] === ['image_id']) {
                return $key;
            }
        }

        return null;
    }

    private function assertRestrictKey(string $table): void
    {
        $key = $this->imageKey($table);

        $this->assertNotNull($key, "{$table}.image_id has no foreign key.");
        $this->assertSame('images', $key['foreign_table']);
        $this->assertSame(['id'], $key['foreign_columns']);
        $this->assertSame('restrict', strtolower((string) $key['on_delete']));
    }
}
