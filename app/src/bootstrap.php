<?php

// Single entry point for shared logic. The front controller requires this once.

require __DIR__ . '/../vendor/autoload.php';

use App\Auth;
use App\Database;

$config = require __DIR__ . '/../config.php';
Database::connect($config['db']);
// Start the session up front (before any page output) so the authenticated
// role can be read safely everywhere — including public pages whose head.php
// injects it for the UI. Idempotent: guards/login/logout re-call it harmlessly.
Auth::startSession();
