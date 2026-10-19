<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Support\Emits;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

// One description per group, on the controller that owns it. Scramble keeps
// whichever #[Group] carries one, so the other controllers in a group repeat
// only the name and the weight.
#[Group('Session', 'Logging in, reading who you are, and changing your own password.', weight: 10)]
class AuthController extends Controller
{
    /**
     * Five failures per username and IP, then a flat lock of DECAY_SECONDS
     * from the first failure. RateLimiter::hit() sets the counter and its
     * `:timer` with cache->add(), a no-op once the key exists, so later hits
     * never extend the TTL. Attempts while throttled are not counted either:
     * login() answers 429 before calling hit().
     *
     * Keyed on both: per IP alone lets a botnet spread attempts across
     * addresses, and per username alone lets one attacker lock a member out.
     */
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 900;

    /**
     * Log in.
     *
     * Anonymous. Send `username` and `password`. A successful call answers
     * `{"ok": true}` and establishes the session cookie every authenticated
     * endpoint reads. It deliberately carries no identity of its own: call
     * `GET /api/v1/me` afterwards for who you are and what you may do.
     *
     * A username that does not exist and a wrong password both answer
     * `401 invalid_credentials`, the same code for each, so that neither can
     * be used to discover which accounts exist.
     *
     * After five failures for one username from one address, further attempts
     * answer `429 too_many_attempts` for fifteen minutes, counted from the
     * first failure. A correct password during the lockout is still refused,
     * and attempts made while locked out do not extend it.
     */
    #[Response(200, 'Logged in. The session cookie is set; nothing in the body is needed.')]
    #[Emits('invalid_credentials', 'too_many_attempts', 'stateful_request_required')]
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        $key = $this->throttleKey($credentials['username'], $request->ip());

        // Checked before the password is verified, so a throttled attacker who
        // finally guesses correctly is still refused.
        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            return ApiError::json(429, 'too_many_attempts', 'Too many attempts');
        }

        // One generic code, never per field, so the answer cannot be used to
        // enumerate usernames. An empty username fails `required` above, and
        // a NULL one matches nothing.
        if (! Auth::attempt($credentials)) {
            RateLimiter::hit($key, self::DECAY_SECONDS);

            return ApiError::json(401, 'invalid_credentials', 'Incorrect username or password');
        }

        // Everything below needs a session. A request Sanctum did not treat as
        // stateful has none, and session() on it throws a 500. The SPA and the
        // test client are both stateful, so only an outside caller hits this.
        //
        // Checked after the attempt, so it cannot probe credentials: a wrong
        // password answers invalid_credentials either way.
        //
        // Not 419 invalid_session, which means "prime the cookie and retry"
        // and would loop forever here. Session auth needs a browser on a
        // configured origin, and this API offers no token credential
        // (ADR 0010).
        if (! $request->hasSession()) {
            return ApiError::json(400, 'stateful_request_required', 'This endpoint requires a session');
        }

        RateLimiter::clear($key);

        // Fixation defence: the pre-login session id must not survive the
        // privilege change.
        $request->session()->regenerate();

        // The absolute-lifetime clock, written after regenerate() so it does
        // not depend on the session driver migrating data. now()->timestamp,
        // so the stamp and EnforceAbsoluteSessionLifetime read the clock a
        // test can move.
        $request->session()->put('auth.started_at', now()->timestamp);

        /** @var Member $member */
        $member = Auth::user();
        $member->forceFill(['last_login_at' => now()])->save();

        // No role or permissions here: GET /api/v1/me is the one shape that
        // describes who you are.
        $body = ['ok' => true];

        return response()->json($body);
    }

    /**
     * Log out.
     *
     * Any logged-in member. Ends the current session, discards its cookie and
     * issues a fresh CSRF token, so the page that called this can go straight
     * on to log in again. Answers `{"ok": true}`.
     *
     * An anonymous caller answers `401 not_authenticated`.
     */
    #[Response(200, 'Logged out. The session is destroyed server-side.')]
    public function logout(Request $request): JsonResponse
    {
        // logout() forgets the member on this request; invalidate() destroys
        // the session data and id, so a copied cookie is worthless;
        // regenerateToken() replaces the CSRF token, since the SPA stays on
        // the page and would otherwise send the dead one next.
        //
        // The `web` guard by name: Sanctum's stateful SPA mode authenticates
        // through the session, and that guard holds the login.
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    /**
     * Read the current member and what they may do.
     *
     * Any logged-in member. Returns the caller's id, username, first and last
     * name, whether they must change their password before anything else
     * (`mustChangePassword`), and `permissions`.
     *
     * `permissions` is the flat list of permission tokens the caller's roles
     * add up to, and it is what a client shows or hides a screen on. Whether
     * the caller answers for events is `attendance.respond` in that list; their
     * register does not decide it.
     *
     * `sectionName`, `committeeFunctionName` and `roles` say where the caller
     * sits in the band, for their own account page. They are for display
     * only. Nothing in this API is authorised by role, so a client decides
     * what to show from `permissions` and ignores `roles` for that.
     *
     * The response is never cacheable. An anonymous caller answers
     * `401 not_authenticated`.
     */
    #[Response(200, 'Who the caller is, and every permission their roles add up to.')]
    public function me(Request $request): JsonResponse
    {
        /** @var Member $member */
        $member = $request->user();

        return response()->json([
            'id' => $member->id,
            'username' => $member->username,
            'firstName' => $member->first_name,
            'lastName' => $member->last_name,
            'mustChangePassword' => $member->must_change_password,
            'permissions' => $member->permissions()->map(fn ($p) => $p->value)->all(),
            /** The register they play in, or null if they do not play. */
            'sectionName' => $member->section?->name,
            /** The register's German name, or null when nobody has typed one: show `sectionName` then. */
            'sectionNameDe' => $member->section?->name_de,
            /** Their seat on the committee, or null if they hold none. */
            'committeeFunctionName' => $member->committeeFunction?->name,
            /** The roles they hold, by key, with the names the committee typed (null for a seeded role nobody renamed: translate the key). For display only: authorise on `permissions`. */
            'roles' => $this->roles($member),
            // Repeats the authenticated group's `no-store` middleware, so an
            // identity stays out of a shared proxy whatever the routes say.
        ])->header('Cache-Control', 'no-store, private');
    }

    /**
     * A typed method rather than an inline map, because the docblock makes
     * Scramble publish a typed list (see MemberResource::roleIds()). Ordered
     * by key, so the account page lists them the same way every time.
     *
     * @return list<array{key: string, labelFr: string|null, labelDe: string|null}>
     */
    private function roles(Member $member): array
    {
        return $member->roles
            ->sortBy('key')
            ->map(fn ($role): array => [
                'key' => (string) $role->key,
                'labelFr' => $role->label_fr,
                'labelDe' => $role->label_de,
            ])
            ->values()
            ->all();
    }

    /**
     * Normalises the username as Laravel's LoginRequest::throttleKey() does.
     * members.username collates utf8mb4_unicode_ci (case-insensitive, PAD
     * SPACE), so without it an attacker could exhaust the limit as
     * "lea.keller" and carry on as "LEA.Keller".
     */
    private function throttleKey(string $username, ?string $ip): string
    {
        return 'login:'.Str::lower(trim($username)).'|'.($ip ?? 'unknown');
    }
}
