<?php

namespace Database\Factories;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * A person on the roster.
 *
 * EVERY MEMBER HAS AN ACCOUNT (2026_09_08_000001), so the defaults include
 * credentials. A test that wants a member without them is testing that the
 * schema refuses it, and should build the row by hand — see
 * MemberModelTest::test_a_member_cannot_exist_without_an_account.
 *
 * Usernames are unique by construction. Two tests were written before this
 * factory existed and collided on a hard-coded username, both times in a
 * helper that looked obviously correct; `unique()` removes the whole class.
 *
 * @extends Factory<Member>
 */
class MemberFactory extends Factory
{
    protected $model = Member::class;

    /**
     * The password every factory-built member has, unless overridden.
     *
     * A constant rather than a literal repeated across the suite: tests log in
     * as these members, and a test that types the password by hand is one
     * rename away from failing for a reason that has nothing to do with what it
     * asserts.
     */
    public const PASSWORD = 'secret123';

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $first = fake()->firstName();
        $last = fake()->lastName();

        return [
            'first_name' => $first,
            'last_name' => $last,
            // Shaped like a real one: lower case, dots, no accents. That is what
            // StoreMemberRequest's regex allows, so a factory member is a member
            // the API would have accepted.
            'username' => Str::slug(Str::ascii("{$first}.{$last}"), '.').'.'.fake()->unique()->numberBetween(1, 99999),
            'password' => self::PASSWORD,
            'must_change_password' => false,
            // Publication of a minor's name is opt-in, and the column defaults
            // false. The factory agrees rather than quietly differing.
            'public_visible' => false,
            'section_id' => null,
            'committee_title' => null,
            'instructor_of_section_id' => null,
        ];
    }

    /** A readable identity, for tests that assert on names or usernames. */
    public function named(string $first, string $last, ?string $username = null): static
    {
        return $this->state(fn (): array => [
            'first_name' => $first,
            'last_name' => $last,
            'username' => $username ?? Str::slug(Str::ascii("{$first}.{$last}"), '.'),
        ]);
    }

    /**
     * Holds the seeded `direction` role, and therefore members.manage.
     *
     * Reads the role rather than creating one: `direction` is reference data
     * seeded by 2026_09_07_000001, which RefreshDatabase runs, and creating a
     * second row with the same key is a duplicate-key error.
     */
    public function administrator(): static
    {
        return $this->withRole('direction');
    }

    /** Holds the seeded `committee` role. */
    public function committee(): static
    {
        return $this->withRole('committee');
    }

    public function withRole(Role|string $role): static
    {
        return $this->afterCreating(function (Member $member) use ($role): void {
            $member->roles()->syncWithoutDetaching([
                ($role instanceof Role ? $role : Role::where('key', $role)->sole())->id,
            ]);
        });
    }

    /**
     * Plays in a register, which is the single fact that makes somebody
     * answerable for events.
     */
    public function inSection(Section|string $section): static
    {
        return $this->state(fn (): array => [
            'section_id' => ($section instanceof Section ? $section : Section::where('name', $section)->sole())->id,
        ]);
    }

    /** The state every committee-issued password leaves behind. */
    public function mustChangePassword(): static
    {
        return $this->state(fn (): array => ['must_change_password' => true]);
    }

    public function publiclyVisible(): static
    {
        return $this->state(fn (): array => ['public_visible' => true]);
    }

    public function withPassword(string $password): static
    {
        return $this->state(fn (): array => ['password' => $password]);
    }
}
