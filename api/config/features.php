<?php

return [

    /*
     * The calendar view on the events page (web/src/pages/Events.tsx). Off
     * unless a server's .env switches it on.
     *
     * filter_var, not a bare env() read: a dotenv value is a string, so
     * "false" would be truthy (config/docs.php casts API_DOCS_ENABLED for the
     * same reason). Casting here covers every consumer, including a direct
     * config('features.calendar') read that bypasses App\Support\Features.
     */
    'calendar' => filter_var(env('FEATURE_CALENDAR', false), FILTER_VALIDATE_BOOLEAN),

];
