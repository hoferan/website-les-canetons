<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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
        if (! Auth::attempt($credentials)) {
            // One generic code, never a per-field error: that would reveal
            // which of username/password was wrong, and enable enumeration.
            return ApiError::json(401, 'invalid_credentials', 'Incorrect username or password');
        }

        $request->session()->regenerate();

        return response()->json(['role' => Auth::user()->role]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
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
