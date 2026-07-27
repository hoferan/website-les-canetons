<?php

namespace App\Support;

/**
 * Reference data for the signup occasions, plus validation of a submitted
 * menus list.
 *
 * Mirrors the old app's App\Repositories\SignupRepository constants
 * (MENU_VALUES, MENU_LABELS, MAX_GUESTS, ACTIVE_OCCASION, OCCASIONS) and its
 * normalizeMenus(). That class is NOT going away yet: nine pages under
 * app/pages/ still read its constants, and a later sub-project retires them.
 * Until then this is a deliberate parallel copy and the two MUST be kept in
 * step — the copy, dates and prices are PLACEHOLDERS and will change, so a
 * change on either side has to be mirrored on the other.
 *
 * SignupRepository::MENU_INFO (per-menu description + price) is intentionally
 * not copied: it is only ever read by the old pages' form markup, never by an
 * API endpoint.
 */
final class Occasion
{
    public const MENU_VALUES = ['meat', 'child', 'vegetarian'];

    public const MENU_LABELS = [
        'meat' => 'Viande',
        'child' => 'Enfant',
        'vegetarian' => 'Végétarien',
    ];

    /**
     * Per-menu description and price, keyed by menu value.
     *
     * Previously excluded from this class because only the old pages' form
     * markup read it. The SPA has no server-rendered markup, so /api/config
     * ships it and this is now the single source of truth — SignupRepository's
     * copy dies with the old app.
     */
    public const MENU_INFO = [
        'meat' => [
            'description' => 'Rôti de bœuf, sauce aux morilles, gratin dauphinois '
                .'et légumes de saison.',
            'price' => 'CHF 45.–',
        ],
        'child' => [
            'description' => 'Émincé de poulet, frites maison et compote.',
            'price' => 'CHF 20.–',
        ],
        'vegetarian' => [
            'description' => 'Risotto aux champignons et légumes rôtis de saison.',
            'price' => 'CHF 40.–',
        ],
    ];

    public const MAX_GUESTS = 30;

    public const ACTIVE = 'anniversary-supper';

    public const ALL = [
        'anniversary-supper' => [
            'title' => 'Souper des 25 ans des Canetons',
            'subtitle' => 'Sortie du nouveau costume · Soirée guggen',
            'date' => '2027-11-13',
            'date_display' => '13 novembre 2027',
            // Two short paragraphs shown identically on the popup, home page and
            // form: `teaser` (what the event is) then `invitation` (the ask).
            'teaser' => 'Fêtez avec nous les 25 ans des Canetons ! Nouveau '
                .'costume, un souper d\'anniversaire et une soirée guggen.',
            'invitation' => 'Amis et familles, réservez votre place et votre menu.',
        ],
    ];

    /** The currently active occasion's data. */
    public static function active(): array
    {
        return self::ALL[self::ACTIVE];
    }

    /**
     * Validate a raw menus value from client input.
     *
     * @return string[]|null clean list of menu values, or null if invalid
     */
    public static function normalizeMenus(mixed $raw): ?array
    {
        if (! is_array($raw)) {
            return null;
        }
        $menus = [];
        foreach ($raw as $item) {
            if (! is_string($item) || ! in_array($item, self::MENU_VALUES, true)) {
                return null;
            }
            $menus[] = $item;
        }
        $count = count($menus);
        if ($count < 1 || $count > self::MAX_GUESTS) {
            return null;
        }

        return $menus;
    }
}
