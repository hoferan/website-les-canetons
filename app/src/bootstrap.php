<?php

// Single entry point for shared logic. The front controller requires this once.

require __DIR__ . '/../vendor/autoload.php';

use App\Auth;
use App\Database;
use App\Env;
use App\Features;

$config = require __DIR__ . '/../config.php';
// Record the deployment environment (dev/test/qa/prod) for the env ribbon.
// Absent/unknown collapses to prod (no ribbon) — see App\Env.
Env::init($config['env'] ?? null);
// Server-owned, hand-set per environment — see App\Features.
Features::init($config['features'] ?? []);
Database::connect($config['db']);
// Start the session up front (before any page output) so the authenticated
// role can be read safely everywhere — including public pages whose head.php
// injects it for the UI. Idempotent: guards/login/logout re-call it harmlessly.
Auth::startSession();
