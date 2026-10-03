<?php

namespace Tests\Feature;

use App\Http\Resources\PhotoResource;
use App\Models\AuditEntry;
use App\Models\HistoryEntry;
use App\Models\Image;
use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Models\SitePhoto;
use App\Support\Permission;
use Closure;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use PDOException;
use Tests\Support\JpegBytes;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * The image library (#105): upload, list, summary, single read and delete,
 * all behind images.manage. Photos and their sizes live in the database.
 */
class ImageLibraryTest extends TestCase
{
    use RefreshDatabase;

    private const OTHER_CONNECTION = 'image_lock_probe';

    private Member $manager;

    private Member $player;

    /** Which write test_a_failure_after_the_insert_leaves_nothing_behind breaks. */
    private ?string $failing = null;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = Member::factory()
            ->withRole(Role::factory()->granting(Permission::ImagesManage)->create())
            ->create();
        $this->player = Member::factory()->inSection('Cloches')->create();
    }

    protected function tearDown(): void
    {
        // Disconnecting ends the session holding any lock a test took.
        DB::purge(self::OTHER_CONNECTION);
        parent::tearDown();
    }

    /**
     * A second session on the same database. GET_LOCK belongs to a session,
     * so asking the default connection would ask the one that may hold it.
     */
    private function otherConnection(): Connection
    {
        config(['database.connections.'.self::OTHER_CONNECTION => config('database.connections.mysql')]);

        return DB::connection(self::OTHER_CONNECTION);
    }

    private function uploadLockIsFree(): bool
    {
        $row = $this->otherConnection()->selectOne(
            'SELECT IS_FREE_LOCK(?) AS free',
            ['lescanetons_image_upload'],
            useReadPdo: false,
        );

        return $row !== null && (string) $row->free === '1';
    }

    /**
     * The three sizes the browser sends for a 3:2 landscape photo, each a
     * distinct byte sequence.
     *
     * @return list<string>
     */
    private function set(int $width = 1920, int $height = 1280): array
    {
        $sizes = [];
        foreach ([1, 2, 4] as $divisor) {
            $sizes[] = JpegBytes::make(intdiv($width, $divisor), intdiv($height, $divisor));
        }

        return $sizes;
    }

    /**
     * @param  list<string>  $parts
     * @param  array<string, string>  $headers
     */
    private function upload(array $parts, ?Member $as = null, array $headers = [], ?string $name = 'Photo de groupe'): TestResponse
    {
        $body = ['files' => $this->files($parts)];
        if ($name !== null) {
            $body['name'] = $name;
        }

        return $this->actingAsMember($as ?? $this->manager)->post(
            '/api/v1/images',
            $body,
            ['Accept' => 'application/json', ...$headers],
        );
    }

    /**
     * POST /images/{image}/file with the current tag, unless $headers names
     * another one or none.
     *
     * @param  list<string>  $parts
     * @param  array<string, string>|null  $headers
     */
    private function replace(Image $image, array $parts, ?array $headers = null): TestResponse
    {
        $headers ??= $this->ifMatch('image', $image);

        return $this->actingAsMember($this->manager)->post(
            "/api/v1/images/{$image->id}/file",
            ['files' => $this->files($parts)],
            ['Accept' => 'application/json', ...$headers],
        );
    }

    /**
     * @param  list<string>  $parts
     * @return list<UploadedFile>
     */
    private function files(array $parts): array
    {
        $files = [];
        foreach ($parts as $i => $bytes) {
            $files[] = UploadedFile::fake()->createWithContent("blob-{$i}.jpg", $bytes);
        }

        return $files;
    }

    /** An uploaded photo, as the API stored it, with real bytes in every size. */
    private function uploaded(int $width = 1920, int $height = 1280): Image
    {
        $id = $this->upload($this->set($width, $height))->assertStatus(201)->json('id');

        return Image::query()->findOrFail($id);
    }

    /** @return list<array{width: int, data: string}> */
    private function storedSizes(Image $image): array
    {
        return DB::table('image_files')
            ->where('image_id', $image->id)
            ->orderByDesc('width')
            ->get(['width', 'data'])
            ->map(fn (object $row): array => ['width' => (int) $row->width, 'data' => (string) $row->data])
            ->all();
    }

    // ------------------------------------------------------------ the upload

    public function test_upload_stores_a_photo_and_every_size(): void
    {
        $parts = $this->set();
        $sha = hash('sha256', $parts[0]);
        $total = array_sum(array_map('strlen', $parts));
        [$large, $mid, $small] = array_map(fn (string $bytes): string => self::fileUrl($bytes), $parts);

        // Sent smallest first: the server finds the largest itself.
        $this->upload(array_reverse($parts))
            ->assertStatus(201)
            ->assertJsonPath('name', 'Photo de groupe')
            ->assertJsonPath('width', 1920)
            ->assertJsonPath('height', 1280)
            ->assertJsonPath('bytes', $total)
            ->assertJsonPath('url', $large)
            ->assertJsonPath('srcset', "{$small} 480w, {$mid} 960w, {$large} 1920w")
            ->assertJsonPath('sizes', [
                ['width' => 480, 'height' => 320, 'bytes' => strlen($parts[2]), 'url' => $small],
                ['width' => 960, 'height' => 640, 'bytes' => strlen($parts[1]), 'url' => $mid],
                ['width' => 1920, 'height' => 1280, 'bytes' => strlen($parts[0]), 'url' => $large],
            ])
            ->assertJsonPath('usages', []);

        $image = Image::query()->sole();
        $this->assertSame($sha, $image->sha256);
        $this->assertSame([1920, 1280, $total], [$image->width, $image->height, $image->bytes]);

        $stored = DB::table('image_files')->where('image_id', $image->id)->orderByDesc('width')->pluck('data')->all();
        $this->assertSame($parts, $stored);
        // Each size's digest is computed from the bytes stored, not taken
        // from anything the request said.
        $this->assertSame(
            array_map(fn (string $bytes): string => hash('sha256', $bytes), $parts),
            DB::table('image_files')->where('image_id', $image->id)->orderByDesc('width')->pluck('sha256')->all(),
        );
        $this->assertDatabaseHas('audit_log', ['action' => 'image.uploaded', 'target_id' => $image->id]);
    }

    public function test_a_single_size_is_a_photo(): void
    {
        $bytes = JpegBytes::make(400, 300);

        $this->upload([$bytes])
            ->assertStatus(201)
            ->assertJsonPath('width', 400)
            ->assertJsonCount(1, 'sizes');
    }

    public function test_an_identical_upload_returns_the_existing_image(): void
    {
        $parts = $this->set();
        $first = $this->upload($parts)->assertStatus(201)->json('id');

        $this->upload($parts)
            ->assertStatus(200)
            ->assertJsonPath('id', $first);

        $this->assertSame(1, Image::query()->count());
        $this->assertSame(3, DB::table('image_files')->count());
    }

    public function test_a_concurrent_duplicate_resolves_to_the_existing_image(): void
    {
        $parts = $this->set();
        $sha = hash('sha256', $parts[0]);
        $raced = null;

        // Another request inserts the same photo after this one has looked for
        // it and before its own insert runs.
        Image::creating(function () use ($sha, &$raced): void {
            if ($raced === null) {
                $raced = DB::table('images')->insertGetId([
                    'name' => 'Ailleurs', 'sha256' => $sha, 'width' => 8, 'height' => 8, 'bytes' => 1,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });

        $this->upload($parts)
            ->assertStatus(200)
            ->assertJsonPath('id', $raced);

        $this->assertSame(1, Image::query()->count());
    }

    public function test_uploads_take_and_release_the_upload_lock(): void
    {
        $taken = null;
        Image::creating(function () use (&$taken): void {
            $taken = ! $this->uploadLockIsFree();
        });

        $this->upload($this->set())->assertStatus(201);

        $this->assertTrue($taken, 'The insert ran without the upload lock held.');
        $this->assertTrue($this->uploadLockIsFree(), 'The upload lock outlived the request.');
    }

    public function test_an_upload_that_cannot_get_the_lock_is_refused_as_unavailable(): void
    {
        config(['api.images.upload_lock_timeout' => 0]);
        $held = $this->otherConnection()->selectOne(
            'SELECT GET_LOCK(?, 0) AS got',
            ['lescanetons_image_upload'],
            useReadPdo: false,
        );
        $this->assertSame('1', (string) $held->got, 'Fixture: the other connection must hold the lock.');

        $this->upload($this->set())
            ->assertStatus(503)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'service_unavailable');

        $this->assertSame(0, Image::query()->count());
    }

    public function test_a_failure_after_the_insert_leaves_nothing_behind(): void
    {
        Image::created(function (): void {
            if ($this->failing === 'the insert') {
                throw new \RuntimeException('insert failed');
            }
        });
        AuditEntry::creating(function (): void {
            if ($this->failing === 'the audit') {
                throw new \RuntimeException('audit failed');
            }
        });

        foreach (['the insert', 'the audit'] as $where) {
            $this->failing = $where;

            $this->upload($this->set())->assertStatus(500);

            $this->assertSame(0, Image::query()->count(), "A row survived a failure in {$where}.");
            $this->assertSame(0, DB::table('image_files')->count(), "A size survived a failure in {$where}.");
            $this->assertTrue($this->uploadLockIsFree(), "The lock survived a failure in {$where}.");
        }
    }

    public function test_a_database_out_of_room_answers_insufficient_storage(): void
    {
        $code = null;
        Image::created(function () use (&$code): void {
            throw $this->queryException($code);
        });

        foreach ([1114, 1021, 1030, 1142, 1153] as $code) {
            $this->upload($this->set())
                ->assertStatus(507)
                ->assertHeader('Content-Type', 'application/problem+json')
                ->assertJsonPath('code', 'image_storage_full');

            $this->assertSame(0, Image::query()->count());
            $this->assertTrue($this->uploadLockIsFree());
        }
    }

    public function test_a_storage_refusal_is_answered_even_when_the_rollback_fails_too(): void
    {
        // A connection that lost a 1153 can fail the rollback after it, and
        // Laravel then throws the rollback's exception, which does not carry
        // the 1153. Here the savepoint that rollback needs is released first.
        Image::created(function (): void {
            DB::statement('RELEASE SAVEPOINT trans2');
            throw $this->queryException(1153);
        });

        try {
            $this->upload($this->set())
                ->assertStatus(507)
                ->assertJsonPath('code', 'image_storage_full');
        } finally {
            // Put the savepoint back, so the test's own rollback finds it
            // even when the assertion fails.
            DB::statement('SAVEPOINT trans2');
        }
    }

    public function test_any_other_database_error_stays_a_server_error(): void
    {
        Image::created(function (): void {
            throw $this->queryException(1205);
        });

        $this->upload($this->set())->assertStatus(500);
    }

    private function queryException(?int $code): QueryException
    {
        $pdo = new PDOException("SQLSTATE[HY000]: General error: {$code}");
        $pdo->errorInfo = ['HY000', $code, 'refused'];

        return new QueryException('mysql', 'insert into image_files', [], $pdo);
    }

    public function test_each_problem_with_a_size_is_reported_against_it(): void
    {
        $cases = [
            'image_not_jpeg' => JpegBytes::png(),
            'image_too_large' => JpegBytes::make(1921, 10),
            'image_too_heavy' => JpegBytes::make(padTo: 614401),
            'image_has_metadata' => JpegBytes::make(exif: true),
            'image_trailing_data' => JpegBytes::make().'<html></html>',
            'image_unexpected_data' => str_replace("\xff\xda", "<html></html>\xff\xda", JpegBytes::make()),
        ];

        foreach ($cases as $reason => $bytes) {
            $this->upload([JpegBytes::make(960, 640), $bytes])
                ->assertStatus(400)
                ->assertJsonPath('code', 'validation_failed')
                ->assertJsonPath('errors.0', ['field' => 'files.1', 'reason' => $reason]);
        }

        $this->assertSame(0, Image::query()->count());
    }

    public function test_a_frame_of_zero_pixels_is_refused_rather_than_divided_by(): void
    {
        foreach ([[0, 0], [0, 10]] as [$width, $height]) {
            $this->upload([JpegBytes::make($width, $height)])
                ->assertStatus(400)
                ->assertJsonPath('errors.0', ['field' => 'files.0', 'reason' => 'image_not_jpeg']);
        }

        $this->assertSame(0, Image::query()->count());
    }

    public function test_more_than_three_sizes_are_refused_before_any_is_read(): void
    {
        // The fourth part is not a JPEG: were it read, the answer would name it.
        $parts = [...$this->set(), JpegBytes::png()];

        $this->upload($parts)
            ->assertStatus(400)
            ->assertJsonPath('errors', [['field' => 'files', 'reason' => 'image_set_too_many']]);

        $this->assertSame(0, Image::query()->count());
    }

    public function test_a_request_heavier_than_three_sizes_is_refused_before_any_is_read(): void
    {
        $this->upload([JpegBytes::png()], headers: ['Content-Length' => (string) (3 * 614400 + 16385)])
            ->assertStatus(400)
            ->assertJsonPath('errors', [['field' => 'files', 'reason' => 'image_set_too_heavy']]);
    }

    public function test_two_sizes_of_the_same_width_are_refused(): void
    {
        $this->upload([JpegBytes::make(960, 640), JpegBytes::make(960, 640, padTo: 2000)])
            ->assertStatus(400)
            ->assertJsonPath('errors', [['field' => 'files', 'reason' => 'image_set_widths_repeated']]);
    }

    public function test_sizes_of_different_shapes_are_refused(): void
    {
        foreach ([[480, 322], [480, 318], [320, 480]] as [$width, $height]) {
            $this->upload([JpegBytes::make(1920, 1280), JpegBytes::make($width, $height)])
                ->assertStatus(400)
                ->assertJsonPath('errors', [['field' => 'files', 'reason' => 'image_set_aspect_mismatch']]);
        }

        $this->assertSame(0, Image::query()->count());
    }

    public function test_one_pixel_of_rounding_is_the_same_shape(): void
    {
        // 4032x3024 scaled to 1920 is 1920x1440; to 481 it is 481x360.75.
        $this->upload([JpegBytes::make(1920, 1440), JpegBytes::make(481, 361)])->assertStatus(201);

        // Portrait: the width is the rounded edge.
        $this->upload([JpegBytes::make(1080, 1920), JpegBytes::make(271, 480)])->assertStatus(201);
    }

    public function test_missing_files_are_required(): void
    {
        $this->actingAsMember($this->manager)
            ->post('/api/v1/images', [], ['Accept' => 'application/json'])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0', ['field' => 'files', 'reason' => 'required']);
    }

    public function test_an_upload_carries_a_trimmed_name_of_at_most_120_characters(): void
    {
        $this->upload([JpegBytes::make(400, 300)], name: '  Répétition du jeudi  ')
            ->assertStatus(201)
            ->assertJsonPath('name', 'Répétition du jeudi');

        // Counted in characters, not bytes: 120 accented letters are 240 bytes.
        $this->upload([JpegBytes::make(401, 300)], name: str_repeat('é', 120))
            ->assertStatus(201);

        $refusals = [
            'required' => [null, '', '   '],
            'too_long' => [str_repeat('é', 121)],
            // Control characters, and the bidirectional overrides that make a
            // downloaded file name read backwards.
            'invalid_format' => ["Répétition\tdu jeudi", "a\nb", "photo\u{202E}gpj.exe", "x\u{2066}y"],
        ];
        foreach ($refusals as $reason => $names) {
            foreach ($names as $name) {
                $this->upload([JpegBytes::make(402, 300)], name: $name)
                    ->assertStatus(400)
                    ->assertJsonPath('errors.0.field', 'name')
                    ->assertJsonPath('errors.0.reason', $reason);
            }
        }

        $this->assertSame(2, Image::query()->count());
    }

    public function test_a_duplicate_upload_keeps_the_name_the_library_has(): void
    {
        $parts = $this->set();
        $this->upload($parts, name: 'Premier nom')->assertStatus(201);

        $this->upload($parts, name: 'Second nom')
            ->assertStatus(200)
            ->assertJsonPath('name', 'Premier nom');
    }

    public function test_the_photo_cap_refuses_the_hundred_and_first(): void
    {
        config(['api.images.capacity' => 2]);
        LibraryImage::create();
        LibraryImage::create();

        $this->upload($this->set())
            ->assertStatus(409)
            ->assertJsonPath('code', 'image_library_full');

        $this->assertSame(2, Image::query()->count());
    }

    public function test_the_byte_cap_counts_every_size(): void
    {
        $parts = $this->set();
        $incoming = array_sum(array_map('strlen', $parts));
        LibraryImage::create(widths: [800, 480], bytesEach: 1000);

        // Room for exactly this upload: it goes in.
        config(['api.images.max_total_bytes' => 2000 + $incoming]);
        $this->upload($parts)->assertStatus(201);

        // One byte short of the next one.
        $next = [JpegBytes::make(300, 200)];
        config(['api.images.max_total_bytes' => 2000 + $incoming + strlen($next[0]) - 1]);
        $this->upload($next)
            ->assertStatus(409)
            ->assertJsonPath('code', 'image_library_full');
    }

    public function test_a_full_library_still_answers_a_re_upload_with_the_existing_image(): void
    {
        $parts = $this->set();
        $id = $this->upload($parts)->assertStatus(201)->json('id');
        config(['api.images.capacity' => 1, 'api.images.max_total_bytes' => 1]);

        $this->upload($parts)->assertStatus(200)->assertJsonPath('id', $id);
    }

    // ----------------------------------------------------------- the reads

    public function test_the_library_lists_newest_first_with_usages(): void
    {
        $old = LibraryImage::create(widths: [800, 480]);
        $old->forceFill(['created_at' => now()->subDay()])->save();
        $new = LibraryImage::create();
        Section::query()->where('name', 'Cloches')->update(['image_id' => $old->id]);
        SitePhoto::query()->where('slot', 'concert')->update(['image_id' => $old->id]);

        $response = $this->actingAsMember($this->manager)->getJson('/api/v1/images')
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.id', $new->id)
            ->assertJsonPath('data.0.usages', [])
            ->assertJsonPath('data.1.id', $old->id)
            ->assertJsonPath('data.1.url', LibraryImage::url($old, 800))
            ->assertJsonPath('data.1.sizes.0.width', 480)
            ->assertJsonPath('data.1.sizes.0.bytes', 1000)
            ->assertJsonPath('data.1.usages.0', ['kind' => 'concert', 'id' => null, 'label' => null])
            ->assertJsonPath('data.1.usages.1.kind', 'register')
            ->assertJsonPath('data.1.usages.1.label', 'Cloches');

        $this->assertMatchesRegularExpression('/\+00:00$/', (string) $response->json('data.0.createdAt'));
    }

    public function test_the_list_reads_sizes_and_usages_in_a_fixed_number_of_queries(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $image = LibraryImage::create(widths: [800, 480]);
            Section::factory()->create(['image_id' => $image->id]);
        }

        // Warm up the session and the permission lookups, then count.
        $this->actingAsMember($this->manager)->getJson('/api/v1/images/summary')->assertOk();

        DB::enableQueryLog();
        $this->actingAsMember($this->manager)->getJson('/api/v1/images')->assertOk();
        $few = count(DB::getQueryLog());

        for ($i = 0; $i < 6; $i++) {
            $image = LibraryImage::create(widths: [800, 480]);
            HistoryEntry::factory()->create(['image_id' => $image->id]);
        }

        DB::flushQueryLog();
        $this->actingAsMember($this->manager)->getJson('/api/v1/images')->assertOk();
        $many = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame($few, $many, 'Listing twice as many images ran more queries.');
    }

    public function test_no_read_but_the_file_route_selects_the_bytes(): void
    {
        $image = LibraryImage::create(widths: [800, 480]);
        Section::query()->where('name', 'Cloches')->update(['image_id' => $image->id]);
        SitePhoto::query()->where('slot', 'band')->update(['image_id' => $image->id]);
        HistoryEntry::factory()->create(['image_id' => $image->id]);

        // The last column says whether the read lists sizes at all. One that
        // does must be seen reading image_files, or the check below passes
        // without having looked at anything.
        $reads = [
            [$this->manager, '/api/v1/images', true],
            [$this->manager, '/api/v1/images/summary', false],
            [$this->manager, "/api/v1/images/{$image->id}", true],
            [$this->manager, '/api/v1/photo-placements', false],
            [null, '/api/v1/band', true],
            [null, '/api/v1/site-photos', true],
            [null, '/api/v1/history', true],
        ];

        foreach ($reads as [$as, $uri, $listsSizes]) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            ($as === null ? $this : $this->actingAsMember($as))->getJson($uri)->assertOk();
            $queries = array_column(DB::getQueryLog(), 'query');
            DB::disableQueryLog();

            if ($listsSizes) {
                $this->assertNotEmpty(
                    array_filter($queries, fn (string $sql) => str_contains($sql, 'image_files')),
                    "{$uri} never read the sizes, so this test proves nothing for it.",
                );
            }

            foreach ($queries as $sql) {
                if (str_contains($sql, 'image_files')) {
                    $this->assertDoesNotMatchRegularExpression('/\bdata\b|\*/', $sql, "{$uri} selected the bytes: {$sql}");
                }
            }
        }

        // The writes answer with the photo too. A replace inserts the new
        // bytes, so only its reads are held to the rule.
        $writes = [
            'the rename' => fn () => $this->actingAsMember($this->manager)
                ->patchJson("/api/v1/images/{$image->id}", ['name' => 'Renommée'], $this->ifMatch('image', $image)),
            'the replace' => fn () => $this->replace($image, $this->set()),
        ];

        foreach ($writes as $what => $write) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $write()->assertOk();
            $queries = array_column(DB::getQueryLog(), 'query');
            DB::disableQueryLog();

            $reads = array_filter($queries, fn (string $sql) => str_contains($sql, 'image_files') && str_starts_with(ltrim($sql), 'select'));
            $this->assertNotEmpty($reads, "{$what} never read the sizes, so this test proves nothing for it.");

            foreach ($reads as $sql) {
                $this->assertDoesNotMatchRegularExpression('/\bdata\b|\*/', $sql, "{$what} selected the bytes: {$sql}");
            }
        }
    }

    public function test_summary_counts_and_sums_every_size(): void
    {
        LibraryImage::create(widths: [800], bytesEach: 1000);
        LibraryImage::create(widths: [800, 480], bytesEach: 1250);

        $this->actingAsMember($this->manager)->getJson('/api/v1/images/summary')
            ->assertOk()
            ->assertExactJson(['count' => 2, 'capacity' => 100, 'bytesTotal' => 3500]);
    }

    public function test_the_single_read_hands_out_the_tag(): void
    {
        $image = LibraryImage::create();

        $this->actingAsMember($this->manager)->getJson("/api/v1/images/{$image->id}")
            ->assertOk()
            ->assertJsonPath('id', $image->id)
            ->assertHeader('ETag', $this->ifMatch('image', $image)['If-Match']);
    }

    // ----------------------------------------------------------- the delete

    public function test_deleting_an_unused_image_removes_it_and_its_sizes(): void
    {
        $image = LibraryImage::create(widths: [800, 480]);
        $kept = LibraryImage::create();

        $this->actingAsMember($this->manager)
            ->deleteJson("/api/v1/images/{$image->id}", [], $this->ifMatch('image', $image))
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertModelMissing($image);
        $this->assertSame(0, DB::table('image_files')->where('image_id', $image->id)->count());
        $this->assertSame(1, DB::table('image_files')->where('image_id', $kept->id)->count());
        $this->assertDatabaseHas('audit_log', ['action' => 'image.deleted', 'target_id' => $image->id]);
    }

    public function test_deleting_a_placed_image_is_refused(): void
    {
        $placements = [
            'register' => fn (Image $i) => Section::query()->where('name', 'Cloches')->update(['image_id' => $i->id]),
            'history' => fn (Image $i) => HistoryEntry::factory()->create(['image_id' => $i->id]),
            'band' => fn (Image $i) => SitePhoto::query()->where('slot', 'band')->update(['image_id' => $i->id]),
        ];

        foreach ($placements as $kind => $place) {
            $image = LibraryImage::create();
            $place($image);

            $this->actingAsMember($this->manager)
                ->deleteJson("/api/v1/images/{$image->id}", [], $this->ifMatch('image', $image))
                ->assertStatus(409)
                ->assertJsonPath('code', 'image_in_use');

            $this->assertModelExists($image);
            $this->assertSame(1, DB::table('image_files')->where('image_id', $image->id)->count(), "The sizes of an image placed as {$kind} were deleted.");
        }
    }

    public function test_a_placement_made_during_the_delete_is_still_refused(): void
    {
        $image = LibraryImage::create();

        // Placed by another request after the usage check and before the
        // DELETE statement: the foreign key refuses it.
        Image::deleting(function (Image $deleting): void {
            Section::query()->where('name', 'Cloches')->update(['image_id' => $deleting->id]);
        });

        $this->actingAsMember($this->manager)
            ->deleteJson("/api/v1/images/{$image->id}", [], $this->ifMatch('image', $image))
            ->assertStatus(409)
            ->assertJsonPath('code', 'image_in_use');

        $this->assertModelExists($image);
        $this->assertSame(1, DB::table('image_files')->where('image_id', $image->id)->count());
    }

    public function test_delete_needs_if_match(): void
    {
        $image = LibraryImage::create();
        $stale = $this->ifMatch('image', $image);
        $image->forceFill(['width' => 801])->save();

        $this->actingAsMember($this->manager)
            ->deleteJson("/api/v1/images/{$image->id}")
            ->assertStatus(428)
            ->assertJsonPath('code', 'if_match_required');

        $this->actingAsMember($this->manager)
            ->deleteJson("/api/v1/images/{$image->id}", [], $stale)
            ->assertStatus(412)
            ->assertJsonPath('code', 'if_match_failed');

        $this->assertModelExists($image);
    }

    public function test_a_placement_moves_the_tag(): void
    {
        $image = LibraryImage::create();
        $before = $this->ifMatch('image', $image);

        HistoryEntry::factory()->create(['image_id' => $image->id]);

        $this->assertNotSame($before, $this->ifMatch('image', $image));
    }

    // --------------------------------------------------- what a URL names

    public function test_every_size_of_a_photo_has_its_own_url(): void
    {
        $image = $this->uploaded();

        $urls = array_column($this->actingAsMember($this->manager)
            ->getJson("/api/v1/images/{$image->id}")->assertOk()->json('sizes'), 'url');

        $this->assertCount(3, $urls);
        $this->assertCount(3, array_unique($urls));
    }

    public function test_the_same_photo_sent_again_with_other_smaller_sizes_gets_other_urls_for_them(): void
    {
        // Deleted and uploaded again, with the same largest size and smaller
        // sizes encoded differently, as another browser would encode them.
        $large = JpegBytes::make(1920, 1280);
        $first = [$large, JpegBytes::make(960, 640), JpegBytes::make(480, 320)];
        $second = [$large, JpegBytes::make(960, 640, padTo: 3000), JpegBytes::make(480, 320, padTo: 3000)];

        $image = Image::query()->findOrFail($this->upload($first)->assertStatus(201)->json('id'));
        $before = array_column($this->sizesOf($image), 'url', 'width');
        $this->actingAsMember($this->manager)
            ->deleteJson("/api/v1/images/{$image->id}", [], $this->ifMatch('image', $image))
            ->assertOk();
        $after = array_column(
            $this->upload($second)->assertStatus(201)->json('sizes'),
            'url',
            'width',
        );

        // The largest is the same bytes, so the same URL; the others are not.
        $this->assertSame($before[1920], $after[1920]);
        $this->assertNotSame($before[960], $after[960]);
        $this->assertNotSame($before[480], $after[480]);
    }

    /** @return list<array{width: int, url: string}> */
    private function sizesOf(Image $image): array
    {
        return $this->actingAsMember($this->manager)
            ->getJson("/api/v1/images/{$image->id}")->assertOk()->json('sizes');
    }

    private static function fileUrl(string $bytes): string
    {
        return '/api/v1/images/'.hash('sha256', $bytes).'.jpg';
    }

    // ----------------------------------------------------------- the rename

    public function test_a_rename_needs_if_match(): void
    {
        $image = LibraryImage::create(name: 'Avant');
        $stale = $this->ifMatch('image', $image);
        $image->forceFill(['width' => 801])->save();

        $this->actingAsMember($this->manager)
            ->patchJson("/api/v1/images/{$image->id}", ['name' => 'Après'])
            ->assertStatus(428)
            ->assertJsonPath('code', 'if_match_required');

        $this->actingAsMember($this->manager)
            ->patchJson("/api/v1/images/{$image->id}", ['name' => 'Après'], $stale)
            ->assertStatus(412)
            ->assertJsonPath('code', 'if_match_failed');

        $this->assertSame('Avant', $image->fresh()?->name);
    }

    public function test_a_rename_trims_the_name_and_moves_the_tag(): void
    {
        $image = LibraryImage::create(name: 'Avant');
        $before = $this->ifMatch('image', $image);

        $response = $this->actingAsMember($this->manager)
            ->patchJson("/api/v1/images/{$image->id}", ['name' => '  Concert de Morat  '], $before)
            ->assertOk()
            ->assertJsonPath('id', $image->id)
            ->assertJsonPath('name', 'Concert de Morat')
            ->assertJsonPath('url', LibraryImage::url($image, 800));

        $this->assertSame('Concert de Morat', $image->fresh()?->name);
        $after = $this->ifMatch('image', $image)['If-Match'];
        $this->assertNotSame($before['If-Match'], $after);
        $response->assertHeader('ETag', $after);
        $this->assertDatabaseHas('audit_log', [
            'action' => 'image.renamed', 'target_id' => $image->id, 'target_label' => 'Concert de Morat',
        ]);
    }

    public function test_the_same_name_again_changes_nothing(): void
    {
        $image = LibraryImage::create(name: 'Pareil');

        $this->actingAsMember($this->manager)
            ->patchJson("/api/v1/images/{$image->id}", ['name' => 'Pareil'], $this->ifMatch('image', $image))
            ->assertOk()
            ->assertJsonPath('name', 'Pareil');

        $this->assertDatabaseMissing('audit_log', ['action' => 'image.renamed']);
    }

    public function test_a_rename_refuses_a_blank_or_long_name(): void
    {
        $image = LibraryImage::create(name: 'Avant');
        $cases = [
            'required' => [[], ['name' => null], ['name' => '   ']],
            'too_long' => [['name' => str_repeat('a', 121)]],
            'invalid_type' => [['name' => ['a']]],
            'invalid_format' => [['name' => "a\u{0007}b"], ['name' => "\u{202E}gpj.exe"]],
        ];

        foreach ($cases as $reason => $bodies) {
            foreach ($bodies as $body) {
                $this->actingAsMember($this->manager)
                    ->patchJson("/api/v1/images/{$image->id}", $body, $this->ifMatch('image', $image))
                    ->assertStatus(400)
                    ->assertJsonPath('errors.0.field', 'name')
                    ->assertJsonPath('errors.0.reason', $reason);
            }
        }

        $this->assertSame('Avant', $image->fresh()?->name);
    }

    // ---------------------------------------------------------- the replace

    public function test_a_replace_swaps_every_size_and_keeps_the_photo_where_it_is_shown(): void
    {
        $image = $this->uploaded();
        $old = $image->sha256;
        Section::query()->where('name', 'Cloches')->update(['image_id' => $image->id]);
        SitePhoto::query()->where('slot', 'band')->update(['image_id' => $image->id]);
        $entry = HistoryEntry::factory()->create(['image_id' => $image->id]);
        $before = $this->ifMatch('image', $image);

        // The same photo turned a quarter: portrait now, so the height is the
        // edge each size was scaled on.
        $parts = $this->set(1280, 1920);
        $sha = hash('sha256', $parts[0]);
        [$large, $mid, $small] = array_map(fn (string $bytes): string => self::fileUrl($bytes), $parts);

        $response = $this->replace($image, array_reverse($parts), $before)
            ->assertOk()
            ->assertJsonPath('id', $image->id)
            ->assertJsonPath('name', 'Photo de groupe')
            ->assertJsonPath('width', 1280)
            ->assertJsonPath('height', 1920)
            ->assertJsonPath('bytes', array_sum(array_map('strlen', $parts)))
            ->assertJsonPath('url', $large)
            ->assertJsonPath('srcset', "{$small} 320w, {$mid} 640w, {$large} 1280w")
            ->assertJsonCount(3, 'usages');

        $this->assertSame(
            [['width' => 1280, 'data' => $parts[0]], ['width' => 640, 'data' => $parts[1]], ['width' => 320, 'data' => $parts[2]]],
            $this->storedSizes($image),
        );
        $this->assertSame(1, Image::query()->count());
        $this->assertSame($sha, $image->fresh()?->sha256);

        // Every placement still names the image, so every page shows the new photo.
        $this->assertSame($image->id, Section::query()->where('name', 'Cloches')->value('image_id'));
        $this->assertSame($image->id, SitePhoto::query()->where('slot', 'band')->value('image_id'));
        $this->assertSame($image->id, $entry->fresh()?->image_id);

        $after = $this->ifMatch('image', $image)['If-Match'];
        $this->assertNotSame($before['If-Match'], $after);
        $response->assertHeader('ETag', $after);
        $this->assertDatabaseHas('audit_log', [
            'action' => 'image.replaced', 'target_id' => $image->id, 'target_label' => "{$old}.jpg → {$sha}.jpg",
        ]);

        // The old URLs name bytes the library no longer holds. Asked of the
        // table rather than the file route, which disconnects and would leave
        // this test's transaction behind.
        $this->assertFalse(Image::query()->where('sha256', $old)->exists());
    }

    public function test_a_replace_runs_every_check_an_upload_runs(): void
    {
        $image = $this->uploaded();
        $kept = $this->storedSizes($image);

        $refusals = [
            ['files.1', 'image_not_jpeg', [JpegBytes::make(960, 640), JpegBytes::png()]],
            ['files.1', 'image_too_large', [JpegBytes::make(960, 640), JpegBytes::make(1921, 10)]],
            ['files.1', 'image_too_heavy', [JpegBytes::make(960, 640), JpegBytes::make(padTo: 614401)]],
            ['files.1', 'image_has_metadata', [JpegBytes::make(960, 640), JpegBytes::make(exif: true)]],
            ['files.1', 'image_trailing_data', [JpegBytes::make(960, 640), JpegBytes::make().'<html></html>']],
            ['files.1', 'image_unexpected_data', [JpegBytes::make(960, 640), str_replace("\xff\xda", "<html></html>\xff\xda", JpegBytes::make())]],
            ['files.0', 'image_not_jpeg', [JpegBytes::make(0, 10)]],
            ['files', 'image_set_too_many', [...$this->set(), JpegBytes::png()]],
            ['files', 'image_set_widths_repeated', [JpegBytes::make(960, 640), JpegBytes::make(960, 640, padTo: 2000)]],
            ['files', 'image_set_aspect_mismatch', [JpegBytes::make(1920, 1280), JpegBytes::make(480, 322)]],
            ['files', 'required', []],
        ];

        foreach ($refusals as [$field, $reason, $parts]) {
            $this->replace($image, $parts)
                ->assertStatus(400)
                ->assertJsonPath('code', 'validation_failed')
                ->assertJsonPath('errors.0', ['field' => $field, 'reason' => $reason]);
        }

        $this->replace($image, [JpegBytes::png()], [
            ...$this->ifMatch('image', $image),
            'Content-Length' => (string) (3 * 614400 + 16385),
        ])
            ->assertStatus(400)
            ->assertJsonPath('errors', [['field' => 'files', 'reason' => 'image_set_too_heavy']]);

        $this->assertSame($kept, $this->storedSizes($image));
        $this->assertDatabaseMissing('audit_log', ['action' => 'image.replaced']);
    }

    public function test_a_replace_needs_if_match(): void
    {
        $image = $this->uploaded();
        $stale = $this->ifMatch('image', $image);
        $image->update(['name' => 'Renommée entre-temps']);

        $this->replace($image, $this->set(1280, 1920), [])
            ->assertStatus(428)
            ->assertJsonPath('code', 'if_match_required');

        $this->replace($image, $this->set(1280, 1920), $stale)
            ->assertStatus(412)
            ->assertJsonPath('code', 'if_match_failed');

        $this->assertSame(1920, $image->fresh()?->width);
    }

    /**
     * Changes the photo once ConditionalWrite has computed its tag and before
     * the controller locks the row: the last query of that computation reads
     * the history's placements, which route binding never does. Answers
     * whether the change ran.
     *
     * @return Closure(): bool
     */
    private function changeAfterTheTagCheck(Image $image): Closure
    {
        $changed = false;
        DB::listen(function ($query) use ($image, &$changed): void {
            if (! $changed && str_contains($query->sql, 'history_entries')) {
                $changed = true;
                DB::table('images')->where('id', $image->id)->update(['name' => 'Changée entre-temps']);
            }
        });

        return function () use (&$changed): bool {
            return $changed;
        };
    }

    public function test_a_change_made_after_the_tag_was_checked_is_not_renamed_over(): void
    {
        $image = LibraryImage::create(name: 'Avant');
        $tag = $this->ifMatch('image', $image);
        $changed = $this->changeAfterTheTagCheck($image);

        $this->actingAsMember($this->manager)
            ->patchJson("/api/v1/images/{$image->id}", ['name' => 'Après'], $tag)
            ->assertStatus(412)
            ->assertJsonPath('code', 'if_match_failed');

        $this->assertTrue($changed(), 'Fixture: the change never ran.');
        $this->assertSame('Changée entre-temps', $image->fresh()?->name);
    }

    public function test_a_change_made_after_the_tag_was_checked_is_not_deleted_unseen(): void
    {
        $image = LibraryImage::create();
        $tag = $this->ifMatch('image', $image);
        $changed = $this->changeAfterTheTagCheck($image);

        $this->actingAsMember($this->manager)
            ->deleteJson("/api/v1/images/{$image->id}", [], $tag)
            ->assertStatus(412)
            ->assertJsonPath('code', 'if_match_failed');

        $this->assertTrue($changed(), 'Fixture: the change never ran.');
        $this->assertModelExists($image);
    }

    public function test_a_rename_answers_the_row_as_stored(): void
    {
        $image = LibraryImage::create(name: 'Avant');
        $tag = $this->ifMatch('image', $image);

        $this->actingAsMember($this->manager)
            ->patchJson("/api/v1/images/{$image->id}", ['name' => 'Après'], $tag)
            ->assertOk()
            ->assertJsonPath('name', 'Après')
            ->assertHeader('ETag', $this->ifMatch('image', $image)['If-Match']);
    }

    public function test_a_change_made_while_the_replace_waited_for_the_lock_is_not_undone(): void
    {
        $image = $this->uploaded();
        $kept = $this->storedSizes($image);

        // Somebody renames the photo after this request's tag was checked and
        // before it holds the upload lock.
        $renamed = false;
        DB::listen(function ($query) use ($image, &$renamed): void {
            if (! $renamed && str_contains($query->sql, 'GET_LOCK')) {
                $renamed = true;
                DB::table('images')->where('id', $image->id)->update(['name' => 'Renommée entre-temps']);
            }
        });

        $this->replace($image, $this->set(1280, 1920))
            ->assertStatus(412)
            ->assertJsonPath('code', 'if_match_failed');

        $this->assertTrue($renamed, 'Fixture: the rename never ran.');
        $this->assertSame($kept, $this->storedSizes($image));
        $this->assertTrue($this->uploadLockIsFree());
    }

    public function test_replacing_a_photo_with_itself_changes_nothing(): void
    {
        $parts = $this->set();
        $image = Image::query()->findOrFail($this->upload($parts)->assertStatus(201)->json('id'));
        $tag = $this->ifMatch('image', $image);

        $this->replace($image, $parts)
            ->assertOk()
            ->assertJsonPath('id', $image->id)
            ->assertHeader('ETag', $tag['If-Match']);

        $this->assertSame($tag, $this->ifMatch('image', $image));
        $this->assertDatabaseMissing('audit_log', ['action' => 'image.replaced']);
    }

    public function test_replacing_with_another_images_photo_is_refused(): void
    {
        $image = $this->uploaded();
        $kept = $this->storedSizes($image);
        $other = $this->set(1200, 800);
        $this->upload($other, name: 'Une autre')->assertStatus(201);

        $this->replace($image, $other)
            ->assertStatus(409)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'image_already_in_library');

        $this->assertSame($kept, $this->storedSizes($image));
        $this->assertSame(2, Image::query()->count());
    }

    public function test_the_byte_cap_counts_only_what_a_replace_adds(): void
    {
        $image = $this->uploaded(960, 640);
        LibraryImage::create(widths: [800, 480], bytesEach: 1000);
        $parts = $this->set(1920, 1280);
        $after = 2000 + array_sum(array_map('strlen', $parts));

        // The photo cap is already reached and does not apply: the count does
        // not change.
        config(['api.images.capacity' => 2]);

        config(['api.images.max_total_bytes' => $after - 1]);
        $this->replace($image, $parts)
            ->assertStatus(409)
            ->assertJsonPath('code', 'image_library_full');
        $this->assertSame(960, $image->fresh()?->width);

        config(['api.images.max_total_bytes' => $after]);
        $this->replace($image, $parts)->assertOk()->assertJsonPath('width', 1920);
    }

    public function test_a_failed_replace_keeps_the_old_sizes(): void
    {
        $image = $this->uploaded();
        $kept = $this->storedSizes($image);
        $sha = $image->sha256;
        AuditEntry::creating(function (AuditEntry $entry): void {
            if ($entry->action === 'image.replaced') {
                throw new \RuntimeException('audit failed');
            }
        });

        $this->replace($image, $this->set(1280, 1920))->assertStatus(500);

        $this->assertSame($kept, $this->storedSizes($image));
        $this->assertSame($sha, $image->fresh()?->sha256);
        $this->assertTrue($this->uploadLockIsFree());
    }

    public function test_a_replace_holds_the_upload_lock(): void
    {
        $image = $this->uploaded();
        $taken = null;
        Image::updating(function () use (&$taken): void {
            $taken = ! $this->uploadLockIsFree();
        });

        $this->replace($image, $this->set(1280, 1920))->assertOk();

        $this->assertTrue($taken, 'The swap ran without the upload lock held.');
        $this->assertTrue($this->uploadLockIsFree(), 'The upload lock outlived the request.');
    }

    public function test_a_replace_that_cannot_get_the_lock_is_refused_as_unavailable(): void
    {
        $image = $this->uploaded();
        config(['api.images.upload_lock_timeout' => 0]);
        $held = $this->otherConnection()->selectOne('SELECT GET_LOCK(?, 0) AS got', ['lescanetons_image_upload'], useReadPdo: false);
        $this->assertSame('1', (string) $held->got, 'Fixture: the other connection must hold the lock.');

        $this->replace($image, $this->set(1280, 1920))
            ->assertStatus(503)
            ->assertJsonPath('code', 'service_unavailable');

        $this->assertSame(1920, $image->fresh()?->width);
    }

    public function test_a_replace_the_database_has_no_room_for_answers_insufficient_storage(): void
    {
        $image = $this->uploaded();
        $kept = $this->storedSizes($image);
        Image::updated(function (): void {
            throw $this->queryException(1114);
        });

        $this->replace($image, $this->set(1280, 1920))
            ->assertStatus(507)
            ->assertJsonPath('code', 'image_storage_full');

        $this->assertSame($kept, $this->storedSizes($image));
        $this->assertTrue($this->uploadLockIsFree());
    }

    // ---------------------------------------------------------- who may ask

    public function test_every_route_refuses_anonymous_and_unpermitted(): void
    {
        $image = LibraryImage::create();
        $routes = [
            ['GET', '/api/v1/images'],
            ['GET', '/api/v1/images/summary'],
            ['GET', "/api/v1/images/{$image->id}"],
            ['POST', '/api/v1/images'],
            ['PATCH', "/api/v1/images/{$image->id}"],
            ['POST', "/api/v1/images/{$image->id}/file"],
            ['DELETE', "/api/v1/images/{$image->id}"],
        ];

        foreach ($routes as [$method, $uri]) {
            $this->json($method, $uri)
                ->assertStatus(401)
                ->assertJsonPath('code', 'not_authenticated');
        }

        foreach ($routes as [$method, $uri]) {
            $this->actingAsMember($this->player)->json($method, $uri)
                ->assertStatus(403)
                ->assertJsonPath('code', 'access_denied');
        }

        $this->assertModelExists($image);
    }

    public function test_the_upload_is_rate_limited(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->actingAsMember($this->manager)
                ->post('/api/v1/images', [], ['Accept' => 'application/json'])
                ->assertStatus(400);
        }

        $this->actingAsMember($this->manager)
            ->post('/api/v1/images', [], ['Accept' => 'application/json'])
            ->assertStatus(429)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'rate_limited');

        // A replacement writes as much as an upload and counts against the
        // same allowance, before its tag is even looked at.
        $image = LibraryImage::create();
        $this->actingAsMember($this->manager)
            ->post("/api/v1/images/{$image->id}/file", [], ['Accept' => 'application/json'])
            ->assertStatus(429)
            ->assertJsonPath('code', 'rate_limited');

        // Per account: somebody else still gets through.
        $other = Member::factory()
            ->withRole(Role::factory()->granting(Permission::ImagesManage)->create())
            ->create();
        $this->actingAsMember($other)
            ->post('/api/v1/images', [], ['Accept' => 'application/json'])
            ->assertStatus(400);
    }

    // ------------------------------------------------------- the placement

    public function test_a_photo_carries_its_largest_size_its_srcset_and_both_alts(): void
    {
        $image = LibraryImage::create(widths: [800, 480]);
        [$large, $small] = [LibraryImage::url($image, 800), LibraryImage::url($image, 480)];

        $this->assertNull(PhotoResource::of(null, 'Texte', 'Text'));
        $this->assertSame([
            'url' => $large,
            'width' => 800,
            'height' => 600,
            'srcset' => "{$small} 480w, {$large} 800w",
            'altFr' => 'Texte',
            'altDe' => null,
        ], PhotoResource::of($image, 'Texte'));
    }
}
