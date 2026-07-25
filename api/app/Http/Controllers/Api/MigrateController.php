<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class MigrateController extends Controller
{
    /**
     * The shared secret arrives in the X-Migrate-Token HEADER, not as a request
     * parameter. Two reasons, either sufficient:
     *
     *  - It is the contract everything outside this app already speaks.
     *    tools/dbmigrate.mjs sends that header (as the old app's
     *    app/api/migrate.php read it), and every environment's CI secrets feed
     *    it. Reading a parameter here would 403 every `npm run dbmigrate:<env>`
     *    the moment /api/migrate starts reaching Laravel.
     *  - $request->input() also accepts the token from the QUERY STRING, and
     *    Apache writes the query string into its access log on every
     *    environment — so ?token=… would persist the secret to disk in
     *    plain text. A header cannot leak that way.
     */
    public function __invoke(Request $request)
    {
        $expectedToken = config('app.migrate_token');
        $providedToken = $request->header('X-Migrate-Token');

        if (! $expectedToken || ! $providedToken || ! hash_equals($expectedToken, (string) $providedToken)) {
            return response()->json(['error' => 'Invalid or missing token'], 403);
        }

        Artisan::call('migrate', ['--force' => true]);

        return response()->json([
            'ok' => true,
            'output' => Artisan::output(),
        ]);
    }
}
