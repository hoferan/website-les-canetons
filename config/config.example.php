<?php
// Copy to config.php and fill in real values. config.php is git-ignored.
return [
    // Deployment environment: 'dev' | 'test' | 'qa' | 'prod'. Drives the
    // non-prod corner ribbon (see App\Env / partials/env_banner.php). Anything
    // missing or unrecognised is treated as 'prod' (no ribbon), so a live
    // config.php without this key is safe.
    'env' => 'prod',
    'db' => [
        'host' => 'CHANGE_ME',
        'user' => 'CHANGE_ME',
        'pass' => 'CHANGE_ME',
        'name' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    // Authenticated SMTP (easy-hebergement). Create a real, ACTIVE mailbox
    // (a "boîte mail" — NOT an alias, which cannot send) and use its full
    // address + password below.
    // easy-hebergement SMTP ports are NON-STANDARD:
    //   secure 'ssl' => port 465  (recommended)
    //   secure 'tls' (STARTTLS) => port 4650  (NOT 587 — 587 is plain here)
    // host is mail-a OR mail-b.easy-hebergement.net — whichever your messagerie
    // detail page shows (it varies per messagerie).
    'mail' => [
        'host'       => 'mail-a.easy-hebergement.net',
        'port'       => 465,
        'secure'     => 'ssl',
        'username'   => 'CHANGE_ME',
        'password'   => 'CHANGE_ME',
        'from_email' => 'CHANGE_ME',
        'from_name'  => 'CHANGE_ME',
    ],
    // Server-owned feature flags (see App\Features): off by default so a new
    // feature never goes live on a server until someone flips it here by hand.
    'features' => [
        'souper_signup' => false,
    ],
    // Self-hosted proof-of-work secret for the public signup challenge
    // (App\Altcha). ANY long random string — generate one per server, no
    // external service. Empty/placeholder fails verification CLOSED (signups
    // blocked), so a server needs a real value before souper_signup is enabled.
    'altcha' => [
        'hmac_secret' => 'CHANGE_ME',
    ],
    // Secret token gating the server-side migration endpoint (POST /api/migrate).
    // Set a long random value per server. Empty/unset — or left as the literal
    // 'CHANGE_ME' placeholder — disables the endpoint (404), so a half-configured
    // server never exposes a live endpoint gated by a well-known string.
    'migrate' => [
        'token' => 'CHANGE_ME',
    ],
];
