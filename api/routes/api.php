<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\MigrateController;
use Illuminate\Support\Facades\Route;

// Public: the SPA fetches this before its first render to learn the
// environment (ribbon). It carries no secrets — see ConfigController.
Route::get('/config', ConfigController::class);

// Public: the contact form is open to anonymous visitors.
Route::post('/contact', ContactController::class);

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
});

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN. Excluded from the OpenAPI document — nothing
// in the browser may trigger a migration.
Route::post('/migrate', MigrateController::class);
