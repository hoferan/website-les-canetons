<?php

return [

    /*
     * R1c-2's calendar. No consumer yet — declared here so the mechanism has
     * something real to carry and so the .env key can reach every server
     * before the feature lands.
     *
     * filter_var, not a bare env() read: a dotenv value is a STRING, so
     * "false" would be truthy — the same reason config/docs.php casts
     * API_DOCS_ENABLED here rather than downstream. Casting at this layer
     * keeps every consumer honest, including a future direct
     * config('features.calendar') read that never goes through
     * App\Support\Features.
     */
    'calendar' => filter_var(env('FEATURE_CALENDAR', false), FILTER_VALIDATE_BOOLEAN),

];
