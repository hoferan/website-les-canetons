<?php

return [

    /*
     * R1c-2's calendar. No consumer yet — declared here so the mechanism has
     * something real to carry and so the .env key can reach every server
     * before the feature lands.
     */
    'calendar' => env('FEATURE_CALENDAR', false),

];
