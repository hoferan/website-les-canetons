<?php

/**
 * Registers every route: clean page/API routes (thin require of the existing
 * page/endpoint file) plus 301-redirect routes for every old .php URL. The
 * single source of truth for the old->new URL mapping.
 */

namespace App;

use FastRoute\RouteCollector;

return function (RouteCollector $r): void {
    $pages = [
        ''                             => 'accueil',
        'historique'                   => 'historique',
        'canetons'                     => 'canetons',
        'cd'                            => 'cd',
        'commencement'                  => 'commencement',
        'moniteurs'                     => 'moniteurs',
        'sponsors'                      => 'sponsors',
        'multimedia'                    => 'multimedia',
        'contact'                       => 'contact',
        'comite_teamdirection'          => 'comite_teamdirection',
        'authentification_inscription'  => 'authentification_inscription',
        'sinscrire'                     => 'sinscrire',
        'confirmation'                  => 'confirmation',
        'inscriptions_utilisateurs'     => 'inscriptions_utilisateurs',
        'planning_repet'                => 'planning_repet',
        'admin'                         => 'admin',
        'inscriptions_admin'            => 'inscriptions_admin',
    ];

    foreach ($pages as $route => $file) {
        $path = $route === '' ? '/' : '/' . $route;
        $r->addRoute('GET', $path, function () use ($file, $route): void {
            $GLOBALS['currentRoute'] = $route;
            require __DIR__ . '/../pages/' . $file . '.php';
        });
        if ($route !== '') {
            // Old direct-file URL -> 301 to the clean route.
            $r->addRoute('GET', '/' . $file . '.php', function () use ($path): void {
                header('Location: ' . $path, true, 301);
                exit;
            });
        }
    }
    // The homepage's old direct-file URL redirects to the root route.
    $r->addRoute('GET', '/index.php', function (): void {
        header('Location: /', true, 301);
        exit;
    });

    $apiMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    $apis = ['contact', 'logout', 'events', 'login', 'responses'];
    foreach ($apis as $name) {
        $r->addRoute($apiMethods, '/api/' . $name, function () use ($name): void {
            require __DIR__ . '/../api/' . $name . '.php';
        });
        $r->addRoute($apiMethods, '/api/' . $name . '.php', function () use ($name): void {
            header('Location: /api/' . $name, true, 301);
            exit;
        });
    }
};
