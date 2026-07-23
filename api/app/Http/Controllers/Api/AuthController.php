<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
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

        $user = User::where('username', $credentials['username'])->first();

        if (!$user) {
            return response()->json(['error' => 'Invalid credentials'], 401);
        }

        $stored = $user->getRawOriginal('password');

        if (password_verify($credentials['password'], $stored)) {
            Auth::login($user);
            $request->session()->regenerate();
            return response()->json(['role' => $user->role]);
        }

        // Legacy rows created before hashing was added store the password as
        // plain text (never a hash — hashes always start with '$'). Accept
        // once via a timing-safe compare, then upgrade the stored value (the
        // 'hashed' cast on User rehashes it automatically on save) so this
        // branch is never taken again for that user.
        if (!str_starts_with($stored, '$') && hash_equals($stored, $credentials['password'])) {
            $user->password = $credentials['password'];
            $user->save();
            Auth::login($user);
            $request->session()->regenerate();
            return response()->json(['role' => $user->role]);
        }

        return response()->json(['error' => 'Invalid credentials'], 401);
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
