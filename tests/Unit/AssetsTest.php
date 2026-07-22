<?php

use App\Assets;
use PHPUnit\Framework\TestCase;

final class AssetsTest extends TestCase
{
    private string $manifestPath;

    protected function setUp(): void
    {
        $this->manifestPath = sys_get_temp_dir() . '/assets-test-manifest-' . uniqid() . '.json';
        file_put_contents($this->manifestPath, json_encode([
            'js/main.js' => [
                'file' => 'assets/main-ABC123.js',
                'isEntry' => true,
                // Vite's real output can list the same shared chunk twice
                // (once per import binding) — the fixture reproduces that.
                'imports' => ['_session-XYZ789.js', '_session-XYZ789.js'],
            ],
            '_session-XYZ789.js' => [
                'file' => 'assets/session-XYZ789.js',
            ],
            'js/admin.js' => [
                'file' => 'assets/admin-DEF456.js',
                'isEntry' => true,
            ],
            'css/accueil.css' => [
                'file' => 'assets/accueil-GHI789.css',
                'isEntry' => true,
            ],
        ]));
        Assets::init($this->manifestPath);
    }

    protected function tearDown(): void
    {
        Assets::init();
        @unlink($this->manifestPath);
    }

    public function testScriptTagsIncludesModulePreloadForImportsWithoutDuplicates(): void
    {
        $html = Assets::scriptTags('main.js');
        $this->assertSame(
            '<link rel="modulepreload" href="/assets/dist/assets/session-XYZ789.js">' . "\n"
                . '<script type="module" src="/assets/dist/assets/main-ABC123.js"></script>',
            $html
        );
    }

    public function testScriptTagsWithoutImportsOmitsModulePreload(): void
    {
        $html = Assets::scriptTags('admin.js');
        $this->assertSame(
            '<script type="module" src="/assets/dist/assets/admin-DEF456.js"></script>',
            $html
        );
    }

    public function testStyleTagReturnsLinkTag(): void
    {
        $html = Assets::styleTag('accueil.css');
        $this->assertSame('<link rel="stylesheet" href="/assets/dist/assets/accueil-GHI789.css">', $html);
    }

    public function testMissingScriptEntryThrows(): void
    {
        $this->expectException(\RuntimeException::class);
        Assets::scriptTags('does-not-exist.js');
    }

    public function testMissingStyleEntryThrows(): void
    {
        $this->expectException(\RuntimeException::class);
        Assets::styleTag('does-not-exist.css');
    }

    public function testMissingManifestFileThrows(): void
    {
        Assets::init('/nonexistent/path/manifest.json');
        $this->expectException(\RuntimeException::class);
        Assets::scriptTags('main.js');
    }
}
