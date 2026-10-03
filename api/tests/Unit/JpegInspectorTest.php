<?php

namespace Tests\Unit;

use App\Support\JpegInspector;
use Tests\Support\JpegBytes;
use Tests\TestCase;

class JpegInspectorTest extends TestCase
{
    private string $file;

    protected function setUp(): void
    {
        parent::setUp();
        $this->file = tempnam(sys_get_temp_dir(), 'jpg');
    }

    protected function tearDown(): void
    {
        @unlink($this->file);
        parent::tearDown();
    }

    private function inspect(string $bytes): array
    {
        file_put_contents($this->file, $bytes);

        return JpegInspector::inspect($this->file);
    }

    public function test_the_builder_makes_a_jpeg_php_recognises(): void
    {
        file_put_contents($this->file, JpegBytes::make(321, 123));
        $info = getimagesize($this->file);

        $this->assertSame(IMAGETYPE_JPEG, $info[2]);
        $this->assertSame(321, $info[0]);
        $this->assertSame(123, $info[1]);
    }

    public function test_a_clean_jpeg_has_no_problems(): void
    {
        $result = $this->inspect(JpegBytes::make(1920, 1080));

        $this->assertSame([], $result['problems']);
        $this->assertSame(1920, $result['width']);
        $this->assertSame(1080, $result['height']);
    }

    public function test_one_pixel_over_the_edge_is_too_large(): void
    {
        $this->assertSame(['image_too_large'], $this->inspect(JpegBytes::make(1921, 10))['problems']);
        $this->assertSame(['image_too_large'], $this->inspect(JpegBytes::make(10, 1921))['problems']);
    }

    public function test_over_600_kb_is_too_heavy(): void
    {
        $this->assertSame(['image_too_heavy'], $this->inspect(JpegBytes::make(padTo: 614401))['problems']);
        $this->assertSame([], $this->inspect(JpegBytes::make(padTo: 614400))['problems']);
    }

    public function test_exif_is_metadata(): void
    {
        $this->assertSame(['image_has_metadata'], $this->inspect(JpegBytes::make(exif: true))['problems']);
    }

    public function test_problems_lists_exactly_what_inspect_reports(): void
    {
        // The vocabulary test demands copy for PROBLEMS, so the list has to
        // match what inspect() can report.
        $reported = [];
        $cases = [
            JpegBytes::png(),
            JpegBytes::make(1921, 10),
            JpegBytes::make(padTo: 614401),
            JpegBytes::make(exif: true),
            JpegBytes::make().'x',
            $this->beforeScan('x'),
        ];
        foreach ($cases as $bytes) {
            $reported = [...$reported, ...$this->inspect($bytes)['problems']];
        }

        $this->assertEqualsCanonicalizing(JpegInspector::PROBLEMS, $reported);
    }

    public function test_xmp_is_metadata(): void
    {
        $this->assertSame(['image_has_metadata'], $this->inspect(JpegBytes::make(xmp: true))['problems']);
    }

    public function test_an_empty_app1_segment_is_refused_and_does_not_throw(): void
    {
        $jpeg = JpegBytes::make();
        $crafted = substr($jpeg, 0, 2)."\xff\xe1\x00\x02".substr($jpeg, 2);

        $this->assertSame(['image_has_metadata'], $this->inspect($crafted)['problems']);
    }

    /** The bytes of a clean JPEG with one segment inserted right after SOI. */
    private function withSegment(string $segment): string
    {
        $jpeg = JpegBytes::make();

        return substr($jpeg, 0, 2).$segment.substr($jpeg, 2);
    }

    /**
     * The bytes of a clean JPEG with something inserted just before SOS, past
     * the frame header getimagesize() stops at.
     */
    private function beforeScan(string $inserted): string
    {
        return str_replace("\xff\xda", $inserted."\xff\xda", JpegBytes::make());
    }

    public function test_a_frame_of_zero_pixels_is_not_a_jpeg(): void
    {
        // getimagesize() reports 0x0 as a JPEG, and a zero width would divide
        // by zero in the set check.
        foreach ([[0, 0], [0, 10], [10, 0]] as [$width, $height]) {
            $this->assertSame(
                ['width' => 0, 'height' => 0, 'problems' => ['image_not_jpeg']],
                $this->inspect(JpegBytes::make($width, $height)),
                "{$width}x{$height}",
            );
        }
    }

    public function test_a_comment_is_refused_as_metadata(): void
    {
        $html = '<html><script>alert(document.cookie)</script></html>';

        $this->assertSame(['image_has_metadata'], $this->inspect($this->withSegment(JpegBytes::segment(0xFE, $html)))['problems']);
    }

    public function test_every_app_segment_a_canvas_does_not_write_is_refused_as_metadata(): void
    {
        $segments = [
            'IPTC in APP13' => JpegBytes::segment(0xED, "Photoshop 3.0\0".'8BIM'),
            'extended XMP' => JpegBytes::segment(0xE1, "http://ns.adobe.com/xmp/extension/\0".str_repeat('a', 40)),
            'an APP0 that is not JFIF' => JpegBytes::segment(0xE0, "JFXX\0\x10"),
            'an APP2 that is not ICC' => JpegBytes::segment(0xE2, "MPF\0"),
            'APP15' => JpegBytes::segment(0xEF, 'anything'),
        ];

        foreach ($segments as $name => $segment) {
            $this->assertSame(['image_has_metadata'], $this->inspect($this->withSegment($segment))['problems'], $name);
        }
    }

    public function test_an_icc_profile_and_an_adobe_segment_are_allowed(): void
    {
        $crafted = $this->withSegment(
            JpegBytes::segment(0xE2, "ICC_PROFILE\0\x01\x01".str_repeat('p', 20))
            .JpegBytes::segment(0xEE, "Adobe\0\x64\0\0\0\0\x01"),
        );

        $this->assertSame([], $this->inspect($crafted)['problems']);
    }

    public function test_bytes_where_a_marker_should_be_are_refused(): void
    {
        $html = '<html><script>alert(document.cookie)</script></html>';

        $this->assertSame(['image_unexpected_data'], $this->inspect($this->beforeScan($html))['problems']);
    }

    public function test_a_marker_a_canvas_does_not_write_is_refused(): void
    {
        // SOF3 is lossless JPEG, and TEM a standalone marker nothing writes.
        foreach (["\xff\xc3\x00\x04\x00\x00", "\xff\x01"] as $marker) {
            $this->assertSame(['image_unexpected_data'], $this->inspect($this->beforeScan($marker))['problems']);
        }
    }

    public function test_the_walk_skips_an_unrelated_app1_to_find_exif_behind_it(): void
    {
        $jpeg = JpegBytes::make(exif: true);
        $foo = "\xff\xe1\x00\x08Foo\0\0\0";
        $crafted = substr($jpeg, 0, 2).$foo.substr($jpeg, 2);

        $this->assertSame(['image_has_metadata'], $this->inspect($crafted)['problems']);
    }

    public function test_a_file_that_ends_mid_segment_does_not_throw_and_is_refused(): void
    {
        $jpeg = JpegBytes::make(40, 30);
        $truncated = substr($jpeg, 0, strpos($jpeg, "\xff\xc4") + 6);

        $result = $this->inspect($truncated);

        $this->assertSame(40, $result['width']);
        $this->assertSame(['image_trailing_data'], $result['problems']);
    }

    public function test_bytes_after_the_eoi_marker_are_refused(): void
    {
        // A JPEG/HTML polyglot: every decoder stops at EOI, and the page
        // behind it is what a browser sniffing the file would find.
        $html = '<html><script>alert(document.cookie)</script></html>';

        $this->assertSame(['image_trailing_data'], $this->inspect(JpegBytes::make().$html)['problems']);
        $this->assertSame(['image_trailing_data'], $this->inspect(JpegBytes::make()."\0")['problems']);
    }

    public function test_a_second_eoi_after_the_payload_does_not_hide_it(): void
    {
        // The file ends in FFD9, but that is not where the JPEG ends.
        $polyglot = JpegBytes::make().'PK'."\x03\x04".str_repeat('z', 40)."\xff\xd9";

        $this->assertSame(['image_trailing_data'], $this->inspect($polyglot)['problems']);
    }

    public function test_a_file_cut_before_its_eoi_is_refused(): void
    {
        $this->assertSame(['image_trailing_data'], $this->inspect(substr(JpegBytes::make(), 0, -2))['problems']);
    }

    public function test_stuffed_bytes_restart_markers_and_a_second_scan_do_not_end_the_file(): void
    {
        // Inside a scan, FF00 is a stuffed byte and FFD0-FFD7 are restart
        // markers. A progressive JPEG has several scans, with tables between.
        $jpeg = JpegBytes::make();
        $scan = "\x3f\xff\x00\x3f\xff\xd0\x3f\xff\xff\xd7\x3f";
        $second = "\xff\xc4\x00\x14\x10".str_repeat("\0", 17)."\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00\x3f";
        $crafted = substr($jpeg, 0, -3).$scan.$second."\xff\xd9";

        $this->assertSame([], $this->inspect($crafted)['problems']);
    }

    public function test_a_png_is_not_a_jpeg(): void
    {
        $this->assertSame(
            ['width' => 0, 'height' => 0, 'problems' => ['image_not_jpeg']],
            $this->inspect(JpegBytes::png()),
        );
    }

    public function test_garbage_is_not_a_jpeg(): void
    {
        $this->assertSame(['image_not_jpeg'], $this->inspect(random_bytes(2000))['problems']);
    }
}
