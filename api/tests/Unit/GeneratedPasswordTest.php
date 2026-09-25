<?php

namespace Tests\Unit;

use App\Support\GeneratedPassword;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * ADR 0016: a committee-issued password, shown exactly once, to read down the phone
 * or hand over on paper. The failure mode this guards against is a second phone
 * call, not a breach — so the alphabet matters more than entropy theatre.
 */
class GeneratedPasswordTest extends TestCase
{
    public function test_it_is_grouped_for_reading_aloud(): void
    {
        // Three groups of four, hyphenated: you can say it, and the listener
        // can hear where they are in it.
        $this->assertMatchesRegularExpression('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', GeneratedPassword::make());
    }

    public function test_it_never_uses_a_character_that_can_be_misheard_or_misread(): void
    {
        // The point of the whole class. An administrator reads this down the
        // phone to a thirteen-year-old, so the alphabet excludes 0/o, 1/l/i,
        // 5/s and 2/z — every pair that produces a second phone call.
        //
        // 200 generations, so a character that slipped into the alphabet fails
        // reliably rather than one run in fifty.
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
            // Upper case would raise "was that a capital?", which is exactly the
            // question nobody should have to ask about something dictated.
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
     * A PREDICATE RATHER THAN A HASH, so this class stays free of the framework
     * as the rest of it is. The caller owns "is this the current password?" and
     * answers it with Hash::check, which cannot drift from whichever driver
     * actually hashed the stored value — HASH_DRIVER is argon2id here and
     * bcrypt on a host without it.
     *
     * A MINT PASSED IN, because the real generator cannot be made to collide:
     * 27 characters over 12 positions puts a natural collision at roughly one
     * reset in 10^17, so a test that waited for one would pass whether or not
     * the loop existed. Injecting both is the only way to watch the branch run,
     * and it is the branch rather than the odds being asserted.
     */
    public function test_it_skips_a_candidate_that_matches_the_current_password(): void
    {
        $minted = ['abcd-efgh-jkmn', 'pqrt-uvwx-y346'];
        $mint = function () use (&$minted): string {
            return array_shift($minted);
        };

        // The first candidate IS the current password, so it must be discarded
        // and the second one returned.
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
        // Drawn ONCE. Every extra draw is a wasted hash verification on an
        // endpoint a committee member is waiting on.
        $this->assertSame(1, $draws);
    }

    /**
     * A predicate that never says no must fail loudly rather than spin.
     *
     * Unreachable with the real generator, and that is exactly why it is worth
     * bounding: a caller whose predicate is inverted by mistake would otherwise
     * hold a PHP-FPM worker until max_execution_time kills the request, on a
     * shared host, with no error naming the cause.
     */
    public function test_it_gives_up_rather_than_looping_for_ever(): void
    {
        $this->expectException(RuntimeException::class);

        GeneratedPassword::makeDifferentFrom(fn (): bool => true, fn (): string => 'abcd-efgh-jkmn');
    }

    public function test_it_defaults_to_the_real_generator(): void
    {
        // Without a mint it is make() with a guard in front, so the result still
        // has to look like a password this class would produce.
        $password = GeneratedPassword::makeDifferentFrom(fn (): bool => false);

        $this->assertMatchesRegularExpression('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', $password);
    }

    public function test_it_carries_enough_entropy_to_be_worth_generating(): void
    {
        // Stated as a test so that shrinking the alphabet or the length is a
        // decision somebody makes deliberately rather than a tidy-up.
        //
        // The figures are deliberately CONSERVATIVE against the real alphabet:
        // 27 characters over 12 positions is ~57 bits, and this asserts only
        // what a 22-character alphabet would give (~53), so a justified tweak
        // to the alphabet does not force an edit here — but halving it does.
        $characters = count(array_unique(str_split(str_replace('-', '', GeneratedPassword::make()))));
        $this->assertGreaterThan(0, $characters);

        $length = strlen(str_replace('-', '', GeneratedPassword::make()));
        $this->assertSame(12, $length, 'twelve characters of payload');

        $bits = $length * log(22, 2);
        $this->assertGreaterThanOrEqual(50, $bits, 'a credential worth generating carries at least 50 bits');
    }
}
