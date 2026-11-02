<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Member;
use App\Models\Role;
use App\Models\TextOverride;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The stored texts of the public pages (#106): one row per catalogue key the
 * band has changed, in French and German, written where the text is shown.
 */
class TextOverrideTest extends TestCase
{
    use RefreshDatabase;

    private Member $manager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = Member::factory()
            ->withRole(Role::factory()->granting(Permission::ContentManage)->create())
            ->create();
    }

    public function test_texts_are_public_and_empty_by_default(): void
    {
        $this->getJson('/api/v1/texts')
            ->assertStatus(200)
            ->assertJsonPath('data', [])
            ->assertJsonPath('meta.total', 0);
    }

    public function test_a_manager_sets_both_languages(): void
    {
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/texts/join.facts.schedule.time', ['fr' => 'De 9h à 11h', 'de' => 'Von 9 bis 11 Uhr'])
            ->assertStatus(200)
            ->assertJsonPath('text.key', 'join.facts.schedule.time')
            ->assertJsonPath('text.fr', 'De 9h à 11h')
            ->assertJsonPath('text.de', 'Von 9 bis 11 Uhr');

        $this->getJson('/api/v1/texts')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.key', 'join.facts.schedule.time')
            ->assertJsonPath('data.0.fr', 'De 9h à 11h')
            ->assertJsonPath('data.0.de', 'Von 9 bis 11 Uhr');
    }

    public function test_one_language_alone_is_stored_with_the_other_null(): void
    {
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/texts/committee.bookingNumber', ['fr' => '026 123 45 67', 'de' => null])
            ->assertStatus(200)
            ->assertJsonPath('text.de', null);

        $this->assertSame('026 123 45 67', TextOverride::query()->find('committee.bookingNumber')?->fr);
    }

    public function test_a_second_write_replaces_the_first(): void
    {
        $this->saveText('join.intro', ['fr' => 'Un', 'de' => 'Eins']);
        $this->saveText('join.intro', ['fr' => 'Deux', 'de' => null]);

        $row = TextOverride::query()->findOrFail('join.intro');
        $this->assertSame(['Deux', null], [$row->fr, $row->de]);
        $this->assertSame(1, TextOverride::query()->count());
    }

    public function test_clearing_both_deletes_the_row(): void
    {
        $this->saveText('join.intro', ['fr' => 'Un', 'de' => 'Eins']);

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/texts/join.intro', ['fr' => null, 'de' => null])
            ->assertStatus(200)
            ->assertJsonPath('text', null);

        $this->assertSame(0, TextOverride::query()->count());
    }

    public function test_an_empty_value_is_stored_as_an_empty_text(): void
    {
        // Null is "the page's default"; an empty string is "nothing here", how
        // a band with no Flickr account leaves the network out.
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/texts/site.flickrUrl', ['fr' => '', 'de' => ''])
            ->assertStatus(200)
            ->assertJsonPath('text.fr', '')
            ->assertJsonPath('text.de', '');

        $row = TextOverride::query()->findOrFail('site.flickrUrl');
        $this->assertSame(['', ''], [$row->fr, $row->de]);
    }

    public function test_a_whitespace_value_is_stored_as_an_empty_text(): void
    {
        $this->saveText('join.intro', ['fr' => "  \n ", 'de' => null]);

        $row = TextOverride::query()->findOrFail('join.intro');
        $this->assertSame(['', null], [$row->fr, $row->de]);
    }

    public function test_values_over_2000_characters_are_refused(): void
    {
        foreach (['fr', 'de'] as $field) {
            $body = array_replace(['fr' => 'ok', 'de' => 'ok'], [$field => str_repeat('a', 2001)]);
            $this->actingAsMember($this->manager)
                ->putJson('/api/v1/texts/join.intro', $body)
                ->assertStatus(400)
                ->assertJsonPath('code', 'validation_failed')
                ->assertJsonPath('errors.0.field', $field);
        }

        $this->assertSame(0, TextOverride::query()->count());
    }

    public function test_a_body_without_both_fields_is_refused(): void
    {
        // Null clears a language, so leaving a field out must not mean the same.
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/texts/join.intro', ['fr' => 'Un'])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'de');
    }

    public function test_a_key_outside_the_pattern_is_not_found(): void
    {
        foreach (['join', 'Join.intro', '1join.intro', 'join..intro', 'join.intro.', 'join-intro.x', 'join.'.str_repeat('a', 124)] as $key) {
            $this->actingAsMember($this->manager)
                ->putJson("/api/v1/texts/{$key}", ['fr' => 'x', 'de' => null])
                ->assertStatus(404);
        }

        $this->assertSame(0, TextOverride::query()->count());
    }

    public function test_a_write_needs_no_if_match_and_hands_out_no_tag(): void
    {
        // One text per write, last save wins; see ConditionalWrite.
        $response = $this->actingAsMember($this->manager)
            ->putJson('/api/v1/texts/join.intro', ['fr' => 'Un', 'de' => null])
            ->assertStatus(200);

        $this->assertNull($response->headers->get('ETag'));
    }

    public function test_writing_refuses_anonymous_and_unpermitted(): void
    {
        $this->putJson('/api/v1/texts/join.intro', ['fr' => 'Un', 'de' => null])
            ->assertStatus(401)->assertJson(['code' => 'not_authenticated']);

        // The photos' manager does not get the texts by implication: the
        // permission is checked on its own.
        $photosOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::ImagesManage)->create())
            ->create();
        $player = Member::factory()->inSection('Cloches')->create();

        foreach ([$photosOnly, $player] as $member) {
            $this->actingAsMember($member)
                ->putJson('/api/v1/texts/join.intro', ['fr' => 'Un', 'de' => null])
                ->assertStatus(403)->assertJson(['code' => 'access_denied']);
        }

        $this->assertSame(0, TextOverride::query()->count());
    }

    public function test_the_write_is_audited(): void
    {
        $this->saveText('join.intro', ['fr' => 'Un', 'de' => null]);
        $this->saveText('join.intro', ['fr' => null, 'de' => null]);

        $entries = AuditEntry::query()->orderBy('id')->get()
            ->map(fn (AuditEntry $e) => [$e->actor_member_id, $e->action, $e->target_type, $e->target_id, $e->target_label])
            ->all();

        $this->assertSame([
            [$this->manager->id, 'text.changed', 'text', null, 'join.intro'],
            [$this->manager->id, 'text.reset', 'text', null, 'join.intro'],
        ], $entries);
    }

    /** @param array{fr: ?string, de: ?string} $body */
    private function saveText(string $key, array $body): void
    {
        $this->actingAsMember($this->manager)
            ->putJson("/api/v1/texts/{$key}", $body)
            ->assertStatus(200);
    }
}
