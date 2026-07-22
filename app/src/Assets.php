<?php

namespace App;

/**
 * Reads the Vite build manifest (app/assets/dist/.vite/manifest.json) and
 * emits the HTML tags for a given entry — the single mechanism both
 * head.php/footer.php and View.php/layout.html.twig use to reference built
 * JS/CSS, instead of each hardcoding asset paths.
 */
final class Assets
{
    private static ?string $manifestPath = null;
    private static ?array $manifest = null;

    /**
     * Points at a specific manifest file (tests use this to inject a
     * fixture); pass null to reset to the real build output.
     */
    public static function init(?string $manifestPath = null): void
    {
        self::$manifestPath = $manifestPath;
        self::$manifest = null;
    }

    private static function manifestPath(): string
    {
        return self::$manifestPath ?? __DIR__ . '/../assets/dist/.vite/manifest.json';
    }

    private static function manifest(): array
    {
        if (self::$manifest === null) {
            $path = self::manifestPath();
            if (!is_file($path)) {
                throw new \RuntimeException(
                    "Vite manifest not found at \"$path\" — run \`npm run build\` (or \`npx vite build\`) first."
                );
            }
            self::$manifest = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        }

        return self::$manifest;
    }

    private static function entry(string $key): array
    {
        $manifest = self::manifest();
        if (!isset($manifest[$key])) {
            throw new \RuntimeException(
                "Vite manifest has no entry for \"$key\" — check it's listed in vite.config.js's entries."
            );
        }

        return $manifest[$key];
    }

    /**
     * <script type="module"> for the given entry, preceded by
     * <link rel="modulepreload"> for each shared chunk it imports.
     */
    public static function scriptTags(string $jsFile): string
    {
        $entry = self::entry("js/$jsFile");
        $tags = [];
        foreach (array_unique($entry['imports'] ?? []) as $importKey) {
            $chunk = self::entry($importKey);
            $tags[] = '<link rel="modulepreload" href="/assets/dist/' . htmlspecialchars($chunk['file']) . '">';
        }
        $tags[] = '<script type="module" src="/assets/dist/' . htmlspecialchars($entry['file']) . '"></script>';

        return implode("\n", $tags);
    }

    /** <link rel="stylesheet"> for the given CSS entry. */
    public static function styleTag(string $cssFile): string
    {
        $entry = self::entry("css/$cssFile");

        return '<link rel="stylesheet" href="/assets/dist/' . htmlspecialchars($entry['file']) . '">';
    }
}
