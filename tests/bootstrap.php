<?php

// PHPUnit bootstrap: autoloads the same App\* classes the app's bootstrap.php
// wires up, minus Database::connect()/Auth::startSession(). The old app's tests
// are pure-logic unit tests; everything DB-backed now lives in the Laravel
// suite (api/), which has its own bootstrap and its own throwaway database.

require __DIR__ . '/../vendor/autoload.php';
