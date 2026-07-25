<?php

use App\Http\Controllers\Api\AltchaController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\MigrateController;
use App\Http\Controllers\Api\SignupController;
use Illuminate\Support\Facades\Route;

// Public: anonymous visitors filling the signup form need a challenge before
// they can submit, so this is deliberately unauthenticated and uncapped.
Route::get('/altcha', AltchaController::class);

// Public: the contact form is open to anonymous visitors.
Route::post('/contact', ContactController::class);

// Public: anyone may reserve a place. Anti-abuse is the honeypot plus the
// proof-of-work challenge above, not authentication.
Route::post('/signups', [SignupController::class, 'store']);

// Admin-only, and the exact opposite of the POST above: the summary and the
// xlsx export list every guest's name, address, phone and email. `view_summary`
// is held by `admin` alone — the capability matrix is not a hierarchy, so
// `user`/`moderator` (who may `respond`) are refused here.
Route::middleware(['auth:sanctum', 'capability:view_summary'])
    ->get('/signups', [SignupController::class, 'index']);

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
});

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN, so it must not require an authenticated user.
Route::post('/migrate', MigrateController::class);
