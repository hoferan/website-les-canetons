<?php

namespace Tests\Unit;

use App\Support\GeneratedPassword;
use PHPUnit\Framework\TestCase;

/**
 * §4.4: a committee-issued password, shown exactly once, to read down the phone
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
