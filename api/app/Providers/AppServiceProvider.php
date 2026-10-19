<?php

namespace App\Providers;

use App\Support\Scramble\ConstrainsPathParameters;
use App\Support\Scramble\DocumentsFailureModes;
use App\Support\Scramble\DocumentsNumericFloors;
use App\Support\Scramble\DocumentsPagination;
use App\Support\Scramble\TidiesResponseMedia;
use Dedoc\Scramble\Scramble;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Guarded because Scramble is a dev dependency: `npm run build` runs
        // `composer install --no-dev`, so no server has the class. Unguarded,
        // the build's `package:discover` fatals with `Class
        // "Dedoc\Scramble\Scramble" not found`, and every request on a server
        // would fatal in boot().
        //
        // /api/docs reads the committed openapi.json, so nothing at runtime
        // needs Scramble.
        if (class_exists(Scramble::class)) {
            $this->configureScramble();
        }

        // The rate limiter the two anonymous write endpoints run behind.
        //
        // Here rather than in bootstrap/app.php's withMiddleware() closure,
        // where `RateLimiter::for()` throws "A facade root has not been set"
        // because the container is still being built.
        //
        // Ten a minute is far above what a person does with a booking form
        // and far below what makes a mail relay worth operating.
        // PublicWriteGuard alone does not stop one: its stamp is not bound to
        // a caller and stays valid for two hours, and each submission sends
        // mail to an address the caller chose.
        //
        // Per IP, because an anonymous caller has no session to key on. The
        // store is the `database` cache the login throttle already requires.
        RateLimiter::for(
            'public-write',
            fn (Request $request) => Limit::perMinute(10)->by($request->ip()),
        );

        // Uploads to the image library (#105). Per account rather than per IP,
        // so members sharing one connection do not share one allowance. Sixty
        // a minute allows a whole folder at once and still stops a runaway
        // loop from filling the disk.
        RateLimiter::for(
            'image-upload',
            fn (Request $request) => Limit::perMinute(60)->by($request->user()->id ?? $request->ip()),
        );

        // Resources go out bare, like /api/v1/config, /api/v1/me and the
        // problem documents, instead of in JsonResource's default {"data": …}
        // wrapper; list envelopes come from PaginatesCollections. This also
        // removes the wrapper from the generated OpenAPI schema, so the
        // generated client matches the real API.
        JsonResource::withoutWrapping();
    }

    /**
     * The three pipelines the OpenAPI export goes through.
     *
     * Only called when Scramble is installed (see boot()), so never on a
     * deployed server.
     */
    private function configureScramble(): void
    {
        // Registered here so all four run in one ordered list. Extensions in
        // config/scramble.php's `extensions` array are appended to the same
        // list but run first, because Scramble's provider boots ahead of this
        // one, so splitting them across both places would reorder them.
        //
        // If a Scramble extension appears to do nothing, put a `throw` in
        // handle() before debugging its logic (see docs/traps.md).
        //
        // DocumentsFailureModes reads each route's failure modes off its
        // middleware. ConstrainsPathParameters publishes a route's `->where()`
        // constraint instead of restating it.
        Scramble::configure()->withOperationTransformers([
            DocumentsFailureModes::class,
            ConstrainsPathParameters::class,
            // The collection envelope, for an operation whose success schema
            // is an array: the static side of what
            // App\Http\Middleware\PaginatesCollections does at runtime.
            DocumentsPagination::class,
            TidiesResponseMedia::class,
        ]);

        // A rule transformer is a separate pipeline. It sees each validation
        // rule as the request schema is built, the only place a `gt:` can
        // still be told apart from the `max:` beside it.
        Scramble::configure()->withRuleTransformers(DocumentsNumericFloors::class);
    }
}
