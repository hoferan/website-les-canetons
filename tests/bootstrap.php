<?php

// PHPUnit bootstrap: autoloads the same App\* classes bootstrap.php wires for
// the app, minus Database::connect()/Auth::startSession() (tests that need
// a DB connect explicitly via IntegrationTestCase, against a test database).

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/Integration/IntegrationTestCase.php';
