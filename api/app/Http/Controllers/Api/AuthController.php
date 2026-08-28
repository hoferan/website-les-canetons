<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        // Standard framework auth: Auth::attempt retrieves the user by
        // username and verifies the password against its bcrypt hash via the
        // configured hasher. Passwords are always stored hashed (User's
        // 'hashed' cast); any pre-hashing legacy rows are converted once, out
        // of band, by a manual DB-level migration — not by the app.
        try {
            $authenticated = Auth::attempt($credentials);
        } catch (RuntimeException $e) {
            // ...but "always" is an invariant of the DATA, and the app cannot
            // enforce it. A row the out-of-band conversion missed makes
            // BcryptHasher::check() throw a bare RuntimeException ("This
            // password does not use the Bcrypt algorithm.") rather than return
            // false, so an unguarded attempt() answers HTTP 500 — outside the
            // {error, code, fields[]} contract, and, with APP_DEBUG=false on
            // every server, with nothing the member or an operator can act on.
            //
            // Narrow the catch by re-deriving the condition instead of matching
            // the message (untranslated framework prose, free to change): only
            // swallow this when the stored value really is not a bcrypt hash.
            // Any other RuntimeException from the auth stack is genuinely
            // unexpected and must keep surfacing as a 500.
            if (! $this->storedPasswordIsNotBcrypt($credentials['username'])) {
                throw $e;
            }

            // The username, never the password or the hash: an operator needs
            // to find the unconverted row, and nothing more.
            Log::error('Login refused: stored password is not a bcrypt hash; re-hash this row.', [
                'username' => $credentials['username'],
            ]);

            $authenticated = false;
        }

        if (! $authenticated) {
            // One generic code, never a per-field error: that would reveal
            // which of username/password was wrong, and enable enumeration.
            // The unconverted-row case lands here too, deliberately — the
            // member sees the same 401 as any other failure, and the detail
            // goes to the log.
            return ApiError::json(401, 'invalid_credentials', 'Incorrect username or password');
        }

        $request->session()->regenerate();

        /** @var User $user */
        $user = Auth::user();

        return response()->json(['role' => $user->role]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    /**
     * Mirrors BcryptHasher::isUsingCorrectAlgorithm() — the single condition
     * under which check() throws — against the row attempt() just read.
     *
     * Reads the column directly: the 'hashed' cast is set-only, so this is the
     * value as stored. Costs one extra query, on the failure path only.
     */
    private function storedPasswordIsNotBcrypt(string $username): bool
    {
        $stored = User::where('username', $username)->value('password');

        return is_string($stored) && $stored !== '' && Hash::info($stored)['algoName'] !== 'bcrypt';
    }

    public function user(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'username' => $user->username,
            'role' => $user->role,
        ]);
    }
}
