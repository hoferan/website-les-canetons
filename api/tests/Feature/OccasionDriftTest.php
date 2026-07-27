<?php

namespace Tests\Feature;

use App\Repositories\SignupRepository;
use App\Support\Occasion;
use PHPUnit\Framework\TestCase;

/**
 * Drift guard: App\Support\Occasion vs the old app's
 * App\Repositories\SignupRepository.
 *
 * WHY THIS EXISTS. During the API migration the two classes are a deliberate
 * parallel copy of the same reference data: nine pages under app/pages/ still
 * read SignupRepository's constants while the Laravel API reads Occasion's.
 * The occasion copy, dates and prices are explicit PLACEHOLDERS awaiting real
 * values, so the likely failure is a real date landing in
 * SignupRepository::OCCASIONS and never reaching Occasion::ALL — after which
 * the old pages and the new API-driven pages advertise DIFFERENT DATES for a
 * public event, silently, until somebody happens to notice. This test pins the
 * two together so that divergence fails a build instead.
 *
 * WHEN TO DELETE IT. This test dies with the old app. When the sub-project that
 * retires app/src/ lands, SignupRepository goes and this file goes with it in
 * the same change — Occasion becomes the only copy, so there is nothing left to
 * drift. If you are reading this because the test suddenly cannot find
 * SignupRepository.php after removing the old app, deleting this file IS the
 * correct fix.
 *
 * Scope is narrow on purpose: reference data only. The new implementations'
 * behaviour is covered by Tests\Unit\OccasionTest and
 * Tests\Unit\SignupStatsTest.
 *
 * It lives under Feature/ rather than Unit/ because it reaches outside the
 * Laravel app to require a file from the old one; it needs no framework, so it
 * extends PHPUnit's TestCase rather than Tests\TestCase.
 */
class OccasionDriftTest extends TestCase
{
    /**
     * Candidate locations of the old class, relative to this file, because the
     * two layouts differ: the repository tree has it at <root>/app/src/..., while
     * the web container's document root puts it at /var/www/html/src/... with
     * this suite mounted alongside at /var/www/html/api-laravel/.
     */
    private const OLD_CLASS_PATHS = [
        __DIR__.'/../../../app/src/Repositories/SignupRepository.php',
        __DIR__.'/../../../src/Repositories/SignupRepository.php',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        // Idempotent: another test may already have loaded the old class. The
        // two projects share the App\ root namespace but not this class name,
        // so requiring it alongside Laravel's autoloader is safe.
        if (class_exists(SignupRepository::class, false)) {
            return;
        }

        foreach (self::OLD_CLASS_PATHS as $path) {
            if (is_file($path)) {
                require_once $path;

                return;
            }
        }

        // Fail loudly rather than skip: a silently-skipped drift guard is worse
        // than no drift guard, since it reports green while checking nothing.
        self::fail(
            'Cannot find the old app\'s SignupRepository, so occasion drift is '
            ."unchecked. Looked for:\n  - "
            .implode("\n  - ", self::OLD_CLASS_PATHS)
            ."\nIf the old app has been retired, delete this test file — see its "
            .'class docblock.'
        );
    }

    public function test_the_shared_reference_data_has_not_drifted(): void
    {
        // assertSame throughout, so key order and types are pinned too, not just
        // the values: the export column order and the menu counts both depend on
        // MENU_VALUES' order.
        $this->assertSame(
            SignupRepository::MENU_VALUES,
            Occasion::MENU_VALUES,
            'MENU_VALUES drifted between SignupRepository and Occasion.'
        );
        $this->assertSame(
            SignupRepository::MENU_LABELS,
            Occasion::MENU_LABELS,
            'MENU_LABELS drifted between SignupRepository and Occasion.'
        );
        $this->assertSame(
            SignupRepository::MENU_INFO,
            Occasion::MENU_INFO,
            'MENU_INFO drifted between SignupRepository and Occasion.'
        );
        $this->assertSame(
            SignupRepository::MAX_GUESTS,
            Occasion::MAX_GUESTS,
            'MAX_GUESTS drifted between SignupRepository and Occasion.'
        );
        $this->assertSame(
            SignupRepository::ACTIVE_OCCASION,
            Occasion::ACTIVE,
            'The active occasion key drifted: SignupRepository::ACTIVE_OCCASION vs Occasion::ACTIVE.'
        );
        $this->assertSame(
            SignupRepository::OCCASIONS,
            Occasion::ALL,
            'The occasion data drifted: SignupRepository::OCCASIONS vs Occasion::ALL. '
            .'If a real date or final copy just arrived, apply it to BOTH classes.'
        );
    }
}
