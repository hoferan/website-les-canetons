<?php

namespace App\Providers;

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
        // The rate limiter the two ANONYMOUS write endpoints run behind.
        //
        // Here rather than in bootstrap/app.php's withMiddleware() closure,
        // which is where it reads most naturally and where it fatals:
        // MEASURED 2026-09-10, `RateLimiter::for()` there throws "A facade
        // root has not been set", because the closure runs while the
        // container is still being built. A boot() method is the first point
        // the facade is usable.
        //
        // Ten a minute is far above anything a person does with a booking
        // form, and far below what makes a mail relay worth operating.
        // PublicWriteGuard alone does not stop one: its stamp is not bound
        // to a caller and stays valid for two hours, so without this a
        // single fetched token buys unlimited submissions, each sending mail
        // inline to an address the caller chose.
        //
        // Per IP, because an anonymous caller has no session to key on. The
        // backing store is the `database` cache this project already
        // requires for the login throttle.
        RateLimiter::for(
            'public-write',
            fn (Request $request) => Limit::perMinute(10)->by($request->ip()),
        );

        // This API returns BARE payloads: /api/config and /api/me both do, and
        // the {error, code, fields[]} error contract has no envelope either.
        // JsonResource wraps COLLECTIONS in {"data": …} by default, which would
        // give the same API two shapes depending on whether a response happened
        // to be built from a Resource.
        //
        // Verified 2026-09-07: this also removes the wrapper from the generated
        // OpenAPI schema, not just from the response — so the generated client
        // and the MSW handlers agree with the real API rather than with each
        // other.
        JsonResource::withoutWrapping();
    }
}
