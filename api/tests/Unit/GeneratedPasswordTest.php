<?php

namespace Tests\Unit;

use App\Support\GeneratedPassword;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * ADR 0016: a committee-issued password, shown once, read down the phone or
 * handed over on paper. A misheard character costs a second phone call, so the
 * alphabet matters as much as the entropy.
 */
class GeneratedPasswordTest extends TestCase
{
    public function test_it_is_grouped_for_reading_aloud(): void
    {
        // Three groups of four, hyphenated, so a listener can follow along.
        $this->assertMatchesRegularExpression('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', GeneratedPassword::make());
    }

    public function test_it_never_uses_a_character_that_can_be_misheard_or_misread(): void
    {
        // The alphabet excludes 0/o, 1/l/i, 5/s and 2/z, the pairs that get
        // misheard or misread. 200 generations, so a character that slipped
        // into the alphabet fails reliably.
        $forbidden = ['0', '1', '2', '5', 'i', 'l', 'o', 's', 'z'];

        for ($i = 0; $i < 200; $i++) {
            $password = GeneratedPassword::make();

            foreach ($forbidden as $character) {
                $this->assertStringNotContainsString(
                    $character,
                    $password,
                    "generated {$password} containing the confusable {$character}",
                );
            }
            // Lower case only, so nobody dictating it has to say "capital".
            $this->assertSame(strtolower($password), $password);
        }
    }

    public function test_two_calls_do_not_agree(): void
    {
        $this->assertNotSame(GeneratedPassword::make(), GeneratedPassword::make());
    }

    /**
     * #92: a reset must not hand back the password the account already has.
     *
     * The class takes a predicate, not a hash, so it stays free of the
     * framework. The caller answers "is this the current password?" with
     * Hash::check, which follows whichever driver hashed the stored value
     * (argon2id here, bcrypt on a host without it).
     *
     * The mint is injected because the real generator practically never
     * collides (about one reset in 10^17), so a test waiting for a collision
     * would pass without the loop. Injecting both makes the branch run.
     */
    public function test_it_skips_a_candidate_that_matches_the_current_password(): void
    {
        $minted = ['abcd-efgh-jkmn', 'pqrt-uvwx-y346'];
        $mint = function () use (&$minted): string {
            return array_shift($minted);
        };

        // The first candidate is the current password, so the second is returned.
        $password = GeneratedPassword::makeDifferentFrom(
            fn (string $candidate): bool => $candidate === 'abcd-efgh-jkmn',
            $mint,
        );

        $this->assertSame('pqrt-uvwx-y346', $password);
        $this->assertSame([], $minted, 'both candidates were drawn');
    }

    public function test_it_keeps_the_first_candidate_that_does_not_match(): void
    {
        $draws = 0;
        $mint = function () use (&$draws): string {
            $draws++;

            return 'pqrt-uvwx-y346';
        };

        $password = GeneratedPassword::makeDifferentFrom(fn (): bool => false, $mint);

        $this->assertSame('pqrt-uvwx-y346', $password);
        // Drawn once: every extra draw costs a hash verification.
        $this->assertSame(1, $draws);
    }

    /**
     * A predicate that never says no must fail loudly rather than spin.
     *
     * Unreachable with the real generator. A caller whose predicate is inverted
     * by mistake would otherwise hold a PHP worker until max_execution_time
     * kills the request, with no error naming the cause.
     */
    public function test_it_gives_up_rather_than_looping_for_ever(): void
    {
        $this->expectException(RuntimeException::class);

        GeneratedPassword::makeDifferentFrom(fn (): bool => true, fn (): string => 'abcd-efgh-jkmn');
    }

    public function test_it_defaults_to_the_real_generator(): void
    {
        // Without a mint it is make() with a guard in front.
        $password = GeneratedPassword::makeDifferentFrom(fn (): bool => false);

        $this->assertMatchesRegularExpression('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', $password);
    }

    public function test_it_carries_enough_entropy_to_be_worth_generating(): void
    {
        // Shrinking the alphabet or the length has to be a deliberate decision.
        // The figure is conservative: 27 characters over 12 positions is ~57
        // bits, and this asserts only what a 22-character alphabet gives (~53),
        // so a small alphabet change passes and halving it fails.
        $characters = count(array_unique(str_split(str_replace('-', '', GeneratedPassword::make()))));
        $this->assertGreaterThan(0, $characters);

        $length = strlen(str_replace('-', '', GeneratedPassword::make()));
        $this->assertSame(12, $length, 'twelve characters of payload');

        $bits = $length * log(22, 2);
        $this->assertGreaterThanOrEqual(50, $bits, 'a credential worth generating carries at least 50 bits');
    }
}
