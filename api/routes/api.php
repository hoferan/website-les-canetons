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

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
});

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN, so it must not require an authenticated user.
Route::post('/migrate', MigrateController::class);
