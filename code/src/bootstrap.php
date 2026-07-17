<?php

// Single entry point for shared logic. Pages/endpoints require this once.

$config = require __DIR__ . '/../config.php';
require __DIR__ . '/Database.php';
require __DIR__ . '/Auth.php';
require __DIR__ . '/repositories/UserRepository.php';
require __DIR__ . '/repositories/EventRepository.php';
require __DIR__ . '/repositories/ResponseRepository.php';
require __DIR__ . '/repositories/SignupRepository.php';
require __DIR__ . '/../vendor/PHPMailer/Exception.php';
require __DIR__ . '/../vendor/PHPMailer/PHPMailer.php';
require __DIR__ . '/../vendor/PHPMailer/SMTP.php';
require __DIR__ . '/Mailer.php';
Database::connect($config['db']);
// Start the session up front (before any page output) so the authenticated
// role can be read safely everywhere — including public pages whose head.php
// injects it for the UI. Idempotent: guards/login/logout re-call it harmlessly.
Auth::startSession();
