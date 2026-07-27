<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ContactRequest;
use App\Models\ContactMessage;
use Illuminate\Http\JsonResponse;

class ContactController extends Controller
{
    public function __invoke(ContactRequest $request): JsonResponse
    {
        // Store raw input; escape at output time (not at storage time).
        ContactMessage::create([
            'last_name' => trim($request->input('lastName')),
            'first_name' => trim($request->input('firstName')),
            'email' => trim($request->input('email')),
            'subject' => trim($request->input('subject')),
            'message' => trim($request->input('message')),
        ]);

        return response()->json(['ok' => true]);
    }
}
