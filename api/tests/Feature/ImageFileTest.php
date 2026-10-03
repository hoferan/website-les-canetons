<?php

namespace Tests\Feature;

use App\Models\Image;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use PDO;
use Tests\Support\JpegBytes;
use Tests\TestCase;

/**
 * The public file behind every size of a library photo (#105). Each size is
 * served at the SHA-256 of its own bytes.
 */
class ImageFileTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<int> */
    private array $created = [];

    /**
     * No wrapping transaction here. The route disconnects from the database
     * before it answers, which would end a test's transaction and take the
     * fixture with it, so the fixture is committed and deleted in tearDown().
     */
    public function beginDatabaseTransaction(): void {}

    protected function tearDown(): void
    {
        DB::table('images')->whereIn('id', $this->created)->delete();
        parent::tearDown();
    }

    /**
     * A photo stored with two sizes.
     *
     * @return array{0: Image, 1: string, 2: string} the photo, its 800 px bytes and its 480 px bytes
     */
    private function stored(): array
    {
        $large = JpegBytes::make(800, 600);
        $small = JpegBytes::make(480, 360);

        $image = Image::query()->create([
            'name' => 'Photo', 'sha256' => hash('sha256', $large), 'width' => 800, 'height' => 600,
            'bytes' => strlen($large) + strlen($small),
        ]);
        foreach ([[800, 600, $large], [480, 360, $small]] as [$width, $height, $bytes]) {
            DB::table('image_files')->insert([
                'image_id' => $image->id, 'width' => $width, 'height' => $height,
                'bytes' => strlen($bytes), 'sha256' => hash('sha256', $bytes), 'data' => $bytes,
            ]);
        }
        $this->created[] = $image->id;

        return [$image, $large, $small];
    }

    /** The path a size is served at: the digest of its own bytes. */
    private static function path(string $bytes): string
    {
        return '/api/v1/images/'.hash('sha256', $bytes).'.jpg';
    }

    /** @param array<string, string> $headers */
    private function fetch(string $uri, array $headers = []): TestResponse
    {
        return $this->get($uri, $headers);
    }

    public function test_each_size_is_served_immutably_and_inertly_at_its_own_digest(): void
    {
        [, $large, $small] = $this->stored();

        foreach ([$large, $small] as $bytes) {
            $response = $this->fetch(self::path($bytes));

            $response->assertOk();
            $this->assertSame($bytes, $response->getContent());
            $this->assertSame('image/jpeg', $response->headers->get('Content-Type'));
            $this->assertSame((string) strlen($bytes), $response->headers->get('Content-Length'));
            $this->assertSame('"'.hash('sha256', $bytes).'"', $response->headers->get('ETag'));
            $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
            $this->assertSame("default-src 'none'; sandbox", $response->headers->get('Content-Security-Policy'));
            $this->assertSame('inline', $response->headers->get('Content-Disposition'));

            $cache = (string) $response->headers->get('Cache-Control');
            $this->assertStringContainsString('immutable', $cache);
            $this->assertStringContainsString('max-age=31536000', $cache);
            $this->assertStringContainsString('public', $cache);
            $this->assertStringNotContainsString('no-store', $cache);
        }
    }

    public function test_a_path_never_serves_bytes_other_than_those_it_names(): void
    {
        // The photo's own digest names its largest size's bytes, which are
        // served at that same digest; it is no way into the smaller ones.
        [$image, $large, $small] = $this->stored();

        $this->assertSame($large, $this->fetch("/api/v1/images/{$image->sha256}.jpg")->getContent());
        $this->assertNotSame(self::path($large), self::path($small));

        foreach ([$large, $small] as $bytes) {
            $served = (string) $this->fetch(self::path($bytes))->getContent();
            $this->assertSame(basename(self::path($bytes), '.jpg'), hash('sha256', $served));
        }
    }

    public function test_a_size_costs_one_query(): void
    {
        // On, as on every server: the route skips RunPendingMigrations, which
        // would otherwise read the migrations table on every photo.
        config(['app.auto_migrate' => true]);
        [, , $small] = $this->stored();

        DB::enableQueryLog();
        $this->fetch(self::path($small))->assertOk();
        $queries = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        $this->assertCount(1, $queries, implode("\n", $queries));
    }

    public function test_the_connection_is_closed_before_the_bytes_are_sent(): void
    {
        // A slow phone takes seconds to download a size, and the host allows
        // ten connections. The fixture's own inserts opened this one.
        [, , $small] = $this->stored();
        $this->assertInstanceOf(PDO::class, DB::connection()->getRawPdo());

        $this->fetch(self::path($small))->assertOk();
        $this->assertNull(DB::connection()->getRawPdo(), 'A 200 kept its connection.');

        DB::connection()->getPdo();
        $this->fetch('/api/v1/images/'.str_repeat('a', 64).'.jpg', ['Accept' => 'application/json'])
            ->assertStatus(404);
        $this->assertNull(DB::connection()->getRawPdo(), 'A 404 kept its connection.');
    }

    public function test_a_matching_if_none_match_answers_304_without_touching_the_database(): void
    {
        [, , $small] = $this->stored();
        $tag = '"'.hash('sha256', $small).'"';

        foreach ([$tag, "W/{$tag}", "\"other\", {$tag}"] as $header) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $response = $this->fetch(self::path($small), ['If-None-Match' => $header]);
            $queries = DB::getQueryLog();
            DB::disableQueryLog();

            $response->assertStatus(304);
            $this->assertSame('', $response->getContent());
            $this->assertSame($tag, $response->headers->get('ETag'));
            $this->assertStringContainsString('immutable', (string) $response->headers->get('Cache-Control'));
            $this->assertSame([], $queries, "A revalidation with {$header} queried the database.");
        }
    }

    public function test_only_the_exact_size_digest_answers_304(): void
    {
        // Another size's tag, or the photo's own digest, names other bytes.
        [$image, $large, $small] = $this->stored();

        foreach (['"'.hash('sha256', $large).'"', "\"{$image->sha256}-480\"", '*'] as $other) {
            $this->assertSame(
                $small,
                $this->fetch(self::path($small), ['If-None-Match' => $other])->assertOk()->getContent(),
                "{$other} answered without the bytes.",
            );
        }
    }

    public function test_the_length_sent_is_that_of_the_bytes_sent(): void
    {
        // A `bytes` column that drifted from the data must not cut the
        // response short or leave the browser waiting for more.
        [$image, , $small] = $this->stored();
        DB::table('image_files')->where('image_id', $image->id)->where('width', 480)->update(['bytes' => 7]);

        $response = $this->fetch(self::path($small));

        $this->assertSame($small, $response->getContent());
        $this->assertSame((string) strlen($small), $response->headers->get('Content-Length'));
    }

    public function test_head_answers_the_length_without_a_body(): void
    {
        [, $large] = $this->stored();

        $response = $this->call('HEAD', self::path($large));

        $response->assertOk();
        $this->assertSame('', $response->getContent());
        $this->assertSame((string) strlen($large), $response->headers->get('Content-Length'));
    }

    public function test_a_same_origin_image_request_sets_no_cookie(): void
    {
        // What a browser sends for an <img> on the site's own pages. Sanctum
        // would treat it as stateful and answer with the session cookie,
        // beside a Cache-Control that lets any cache keep it.
        [, $large] = $this->stored();

        $response = $this->fetch(self::path($large), [
            'Referer' => 'http://localhost/',
            'Origin' => 'http://localhost',
        ]);

        $response->assertOk();
        $this->assertSame([], $response->headers->getCookies());
    }

    public function test_an_unknown_size_is_404(): void
    {
        $this->stored();

        $this->fetch('/api/v1/images/'.str_repeat('a', 64).'.jpg', ['Accept' => 'application/json'])
            ->assertStatus(404)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'not_found');
    }

    public function test_a_deleted_photo_takes_its_sizes_with_it(): void
    {
        [$image, $large] = $this->stored();
        $image->delete();

        $this->assertSame(0, DB::table('image_files')->where('image_id', $image->id)->count());
        $this->fetch(self::path($large), ['Accept' => 'application/json'])
            ->assertStatus(404);
    }

    public function test_a_malformed_path_is_not_routed_to_the_file(): void
    {
        [$image, $large] = $this->stored();
        $digest = hash('sha256', $large);

        foreach ([
            '/api/v1/images/abc.jpg',
            '/api/v1/images/'.strtoupper($digest).'.jpg',
            '/api/v1/images/'.substr($digest, 1).'.jpg',
            "/api/v1/images/{$digest}0.jpg",
            "/api/v1/images/{$digest}.jpeg",
            "/api/v1/images/{$digest}",
            // The earlier shape, photo digest and width, is no path at all.
            "/api/v1/images/{$image->sha256}/800.jpg",
        ] as $uri) {
            $this->fetch($uri, ['Accept' => 'application/json'])
                ->assertStatus(404)
                ->assertJsonPath('code', 'not_found');
        }
    }
}
