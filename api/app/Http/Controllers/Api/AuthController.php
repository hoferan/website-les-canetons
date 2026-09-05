<?php

namespace App\Http\Controllers\Api;

// NOTE: the auth guard's provider model (App\Models\Member) is introduced in
// Task 2, which also repoints api/config/auth.php at it. Until then,
// Auth::attempt() below has no model to resolve against and login cannot
// succeed.

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

        if (! Auth::attempt($credentials)) {
            // One generic code, never a per-field error: that would reveal
            // which of username/password was wrong, and enable enumeration.
            return ApiError::json(401, 'invalid_credentials', 'Incorrect username or password');
        }

        $request->session()->regenerate();

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

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'username' => $user->username,
            'role' => $user->role,
        ]);
    }
}
