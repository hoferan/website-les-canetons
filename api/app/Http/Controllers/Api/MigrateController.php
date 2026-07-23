<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class MigrateController extends Controller
{
    public function __invoke(Request $request)
    {
        $expectedToken = config('app.migrate_token');
        $providedToken = $request->input('token');

        if (!$expectedToken || !$providedToken || !hash_equals($expectedToken, (string) $providedToken)) {
            return response()->json(['error' => 'Invalid or missing token'], 403);
        }

        Artisan::call('migrate', ['--force' => true]);

        return response()->json([
            'ok' => true,
            'output' => Artisan::output(),
        ]);
    }
}
