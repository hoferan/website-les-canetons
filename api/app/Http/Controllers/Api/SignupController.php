<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\SignupRequest;
use App\Mail\SignupConfirmation;
use App\Models\Signup;
use App\Support\Altcha;
use App\Support\ChallengeGuard;
use App\Support\Occasion;
use App\Support\SignupStats;
use Dedoc\Scramble\Attributes\BodyParameter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Shuchkin\SimpleXLSXGen;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The signup endpoints, with deliberately opposite access rules:
 *
 *   POST /api/signups — PUBLIC (see store() below);
 *   GET  /api/signups — admin-only, `view_summary` (see index()).
 *
 * store(): the public reservation form. One contact registers a table of
 * guests; the occasion is fixed server-side.
 *
 * A straight port of the legacy app/api/signups.php POST branch, whose four
 * security properties and their ORDER are the whole point of this class:
 *
 *   1. honeypot, before anything else — a trapped bot gets a plain 201;
 *   2. validation;
 *   3. the fail-closed proof-of-work gate, then the single-use replay guard,
 *      both before any insert or mail;
 *   4. insert, then a fail-safe mail send.
 *
 * Reordering any of these weakens the endpoint without failing loudly, so
 * tests/Feature/SignupStoreTest.php pins each step and both orderings.
 */
class SignupController extends Controller
{
    /**
     * GET /api/signups — the admin summary, or ?format=xlsx for the export.
     *
     * Admin-only (`view_summary`), enforced by the route's middleware.
     * Deliberately parameterless apart from `format`: the old endpoint had no
     * paging, filtering or sorting and signups_admin.js expects the whole set.
     */
    public function index(Request $request): JsonResponse|StreamedResponse
    {
        // ORDER BY table_name, id — the old query's ordering, and load-bearing:
        // SignupStats::compute() groups tables in FIRST-SEEN order, so this is
        // what decides the order of `tables` in the response.
        $signups = Signup::query()
            ->where('occasion', Occasion::ACTIVE)
            ->orderBy('table_name')
            ->orderBy('id')
            ->get()
            ->map(fn (Signup $s): array => [
                'first_name' => (string) $s->first_name,
                'last_name' => (string) $s->last_name,
                'address' => (string) $s->address,
                'phone' => (string) $s->phone,
                'email' => (string) $s->email,
                'table_name' => (string) $s->table_name,
                'menus' => is_array($s->menus) ? $s->menus : [],
            ])
            ->all();

        if ((string) $request->query('format', '') === 'xlsx') {
            return $this->xlsx($signups);
        }

        // Same body as the old endpoint: computeStats() plus the occasion.
        return response()->json(
            SignupStats::compute($signups) + ['occasion' => Occasion::active()]
        );
    }

    /**
     * The spreadsheet export. SignupStats::exportRows() has already neutralized
     * leading =, +, -, @ so no cell can open as a formula in the admin's
     * spreadsheet app.
     *
     * The workbook is built BEFORE the response, not inside the callback: a
     * failure there happens after the headers are already on the wire, which
     * would hand the admin a file with perfect headers and no contents. Built
     * here, a failure is still an error response. Size is bounded by the guest
     * list, so holding it in memory is not a concern.
     *
     * @param  array<int,array>  $signups
     */
    private function xlsx(array $signups): StreamedResponse
    {
        // __toString() writes through a seekable php://memory stream. Do NOT
        // swap in saveAs('php://output'): the ZIP writer ftell()s to record
        // central-directory offsets, and php://output is not seekable.
        $book = (string) SimpleXLSXGen::fromArray(SignupStats::exportRows($signups));
        if ($book === '') {
            throw new \RuntimeException('Failed to generate the signups spreadsheet.');
        }

        return response()->streamDownload(
            function () use ($book) {
                echo $book;
            },
            'inscriptions-souper.xlsx',
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }

    #[BodyParameter('first_name', description: 'Guest first name.', required: true)]
    #[BodyParameter('last_name', description: 'Guest last name.', required: true)]
    #[BodyParameter('address', description: 'Postal address.', required: true)]
    #[BodyParameter('phone', description: 'Contact phone number.', required: true)]
    #[BodyParameter('email', description: 'Confirmation is mailed here.', required: true)]
    #[BodyParameter('table_name', description: 'Free-text table or group name.', required: true)]
    #[BodyParameter('menus', description: 'One menu value per guest; see /config for the allowed values.', required: true, type: 'array')]
    #[BodyParameter('altcha', description: 'Solved proof-of-work payload from GET /altcha.', required: true)]
    #[BodyParameter('hp', description: 'Honeypot. A real client leaves this empty.', required: false)]
    public function store(Request $request): JsonResponse
    {
        // (1) Honeypot: a real form never fills this. Silently accept — same
        // 201 and same body as a real success — without storing or mailing, so
        // a bot never learns it was trapped. Nothing is logged either: a log
        // line is a side channel if the attacker can read it, and this branch is
        // not an error.
        if (trim((string) $request->input('hp', '')) !== '') {
            return response()->json(['ok' => true], 201);
        }

        // (2) Validation, resolved EXPLICITLY rather than injected as a method
        // parameter: an injected FormRequest is validated before the method body
        // runs, which would put validation ahead of the honeypot above and let a
        // bot's malformed submission be told it was malformed.
        $form = app(SignupRequest::class);
        $data = $form->validated();

        // (3) Proof-of-work gate + single-use replay guard, before insert/mail.
        if (! $this->verifyChallenge((string) $request->input('altcha', ''))) {
            return ApiError::json(
                403,
                'captcha_failed',
                'Anti-bot verification failed, please try again'
            );
        }

        // (4) Insert. `occasion` is fixed server-side and never read from the
        // request. Raw input is stored as submitted; escaping happens at output
        // time.
        $signup = [
            'first_name' => trim($data['first_name']),
            'last_name' => trim($data['last_name']),
            'address' => trim($data['address']),
            'phone' => trim($data['phone']),
            'email' => trim($data['email']),
            'table_name' => trim($data['table_name']),
            'menus' => $form->menus(),
        ];
        Signup::create(['occasion' => Occasion::ACTIVE] + $signup);

        // Fail-safe: the reservation is already stored. A mail error must not
        // turn into an error response — losing a reservation because SMTP was
        // down is the worst outcome here — so log it and still return 201.
        try {
            Mail::send(new SignupConfirmation(Occasion::active(), $signup));
        } catch (\Throwable $e) {
            Log::error('Signup confirmation mail failed: '.$e->getMessage());
        }

        return response()->json(['ok' => true], 201);
    }

    /**
     * Verify the proof-of-work solution and consume it, once.
     *
     * Fail-closed at every step: this is the endpoint's only anti-automation
     * defence, so anything unverifiable — including a misconfigured server — is
     * a refusal, never a pass.
     */
    private function verifyChallenge(string $payload): bool
    {
        // ChallengeGuard IS the replay protection, and it is Cache::add(). The
        // `array` store is per-process and `file` is per-server, so on either of
        // them every replay would succeed while every test stayed green. Refuse
        // rather than run without the guard the rest of this method assumes.
        $store = (string) config('cache.default');
        if (! in_array($store, ['database', 'redis', 'memcached'], true)) {
            Log::error("Signup rejected: cache store '{$store}' cannot hold the Altcha replay guard.");

            return false;
        }

        // A server left on the placeholder or an empty secret must fail closed:
        // the example value is public, so any challenge it signs is forgeable.
        $secret = (string) config('app.altcha_secret');
        if ($secret === '' || $secret === 'CHANGE_ME') {
            Log::error('Signup rejected: ALTCHA_HMAC_SECRET is unset or still the placeholder.');

            return false;
        }

        $signature = (new Altcha($secret))->verifySolution($payload);
        if ($signature === null) {
            return false;
        }

        // Single use. The guard must outlive the challenge it protects, hence
        // the challenge's own TTL rather than a second, driftable literal.
        return (new ChallengeGuard)->consume($signature, AltchaController::TTL_SECONDS);
    }
}
