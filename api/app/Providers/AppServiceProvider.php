<?php

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
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
