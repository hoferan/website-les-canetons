<?php

// PHPUnit bootstrap: wires the same global classes bootstrap.php wires for
// the app, minus Database::connect()/Auth::startSession() (tests that need
// a DB connect explicitly via IntegrationTestCase, against a test database).

require __DIR__ . '/../code/src/Database.php';
require __DIR__ . '/../code/src/Auth.php';
require __DIR__ . '/../code/src/repositories/UserRepository.php';
require __DIR__ . '/../code/src/repositories/EventRepository.php';
require __DIR__ . '/../code/src/repositories/ResponseRepository.php';
require __DIR__ . '/Integration/IntegrationTestCase.php';
