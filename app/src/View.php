<?php

namespace App;

use App\Repositories\SignupRepository;
use Twig\Environment;
use Twig\Loader\FilesystemLoader;

/**
 * Renders page templates through the shared Twig base layout
 * (templates/layout.html.twig). Assembles the same context
 * head.php/footer.php/navigation.php compute today — session role, env
 * ribbon, nav active-state, the souper-signup popup — so a template only
 * has to supply its own title/CSS/scripts/content.
 */
final class View
{
    private static ?Environment $twig = null;

    private static function twig(): Environment
    {
        if (self::$twig === null) {
            $loader = new FilesystemLoader(__DIR__ . '/../templates');
            // No disk cache (see plan's Global Constraints): no writable
            // directory to rely on on the FTP/shared-hosting deploy target.
            self::$twig = new Environment($loader, [
                'cache' => false,
                'debug' => !Env::isProd(),
            ]);
        }

        return self::$twig;
    }

    /** @param string[] $pageScripts */
    public static function renderPage(
        string $template,
        string $pageTitle,
        string $pageCss,
        array $pageScripts,
        string $currentRoute
    ): void {
        $showSignupPopup = Features::enabled('souper_signup') && !Auth::canViewSummary();

        echo self::twig()->render($template, [
            'page_title' => $pageTitle,
            'page_css' => $pageCss,
            'page_scripts' => $pageScripts,
            'current_route' => $currentRoute,
            'session_role_json' => json_encode(Auth::role()),
            'env_is_prod' => Env::isProd(),
            'env_current' => Env::current(),
            'env_ribbon_label' => Env::ribbonLabel(),
            'show_signup_popup' => $showSignupPopup,
            'popup_occasion' => $showSignupPopup
                ? SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION]
                : null,
        ]);
    }
}
