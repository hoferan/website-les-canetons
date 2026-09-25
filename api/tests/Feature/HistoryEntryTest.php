<?php

namespace Tests\Feature;

use App\Models\HistoryEntry;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HistoryEntryTest extends TestCase
{
    use RefreshDatabase;

    private Member $editor;

    private Member $player;

    protected function setUp(): void
    {
        parent::setUp();
        $this->editor = Member::factory()
            ->withRole(Role::factory()->granting(Permission::HistoryManage)->create())
            ->create();
        $this->player = Member::factory()->inSection('Cloches')->create();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'occurredOn' => '2002-10-15',
            'precision' => 'month',
            'titleFr' => 'Les débuts',
            'bodyFr' => null,
            'titleDe' => null,
            'bodyDe' => null,
            'important' => true,
            'icon' => 'flag',
        ], $overrides);
    }

    public function test_the_list_is_public_and_oldest_first(): void
    {
        HistoryEntry::query()->delete();
        HistoryEntry::factory()->create(['occurred_on' => '2019-01-01', 'title_fr' => 'B']);
        HistoryEntry::factory()->create(['occurred_on' => '2002-10-01', 'title_fr' => 'A']);

        $this->getJson('/api/v1/history')
            ->assertOk()
            ->assertJsonPath('data.0.titleFr', 'A')
            ->assertJsonPath('data.1.titleFr', 'B')
            ->assertJsonPath('data.0.occurredOn', '2002-10-01');
    }

    public function test_writes_need_a_session_then_the_permission(): void
    {
        $entry = HistoryEntry::factory()->create();
        $before = HistoryEntry::count();

        $this->postJson('/api/v1/history', $this->payload())
            ->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
        $this->actingAsMember($this->player)->postJson('/api/v1/history', $this->payload())
            ->assertStatus(403)->assertJson(['code' => 'access_denied']);
        $this->actingAsMember($this->player)->getJson("/api/v1/history/{$entry->id}")
            ->assertStatus(403);
        $this->assertSame($before, HistoryEntry::count());
    }

    public function test_it_creates_and_truncates_the_date_to_its_precision(): void
    {
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['occurredOn' => '2019-06-14', 'precision' => 'year']))
            ->assertStatus(201)
            ->assertJsonPath('occurredOn', '2019-01-01')
            ->assertJsonPath('icon', 'flag')
            ->assertJsonPath('important', true);
    }

    public function test_any_single_text_field_is_enough(): void
    {
        foreach (['titleFr', 'bodyFr', 'titleDe', 'bodyDe'] as $field) {
            $this->actingAsMember($this->editor)
                ->postJson('/api/v1/history', $this->payload(['titleFr' => null, $field => 'Texte']))
                ->assertStatus(201)
                ->assertJsonPath($field, 'Texte');
        }
    }

    public function test_four_empty_or_blank_fields_are_refused_as_an_empty_entry(): void
    {
        $before = HistoryEntry::count();

        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload([
                'titleFr' => '   ', 'bodyFr' => '', 'titleDe' => null, 'bodyDe' => "\n",
            ]))
            ->assertStatus(422)
            ->assertJson(['code' => 'history_entry_empty']);
        $this->assertSame($before, HistoryEntry::count());
    }

    public function test_blank_strings_are_stored_as_null(): void
    {
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['bodyFr' => '  ']))
            ->assertStatus(201)
            ->assertJsonPath('bodyFr', null);
    }

    public function test_an_unknown_icon_and_precision_are_refused(): void
    {
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['icon' => 'rocket']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'icon')
            ->assertJsonPath('errors.0.reason', 'invalid_value');
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['precision' => 'week']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'precision');
    }

    public function test_a_title_over_120_is_refused(): void
    {
        $this->actingAsMember($this->editor)
            ->postJson('/api/v1/history', $this->payload(['titleFr' => str_repeat('a', 121)]))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'titleFr')
            ->assertJsonPath('errors.0.reason', 'too_long');
    }

    public function test_update_and_delete_need_the_current_tag(): void
    {
        $entry = HistoryEntry::factory()->create();

        $this->actingAsMember($this->editor)
            ->putJson("/api/v1/history/{$entry->id}", $this->payload())
            ->assertStatus(428)->assertJson(['code' => 'if_match_required']);
        $this->actingAsMember($this->editor)
            ->withHeader('If-Match', '"stale"')
            ->deleteJson("/api/v1/history/{$entry->id}")
            ->assertStatus(412)->assertJson(['code' => 'if_match_failed']);

        $this->actingAsMember($this->editor)
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['titleFr' => 'Corrigé']))
            ->assertOk()->assertJsonPath('titleFr', 'Corrigé');

        $entry->refresh();
        $this->actingAsMember($this->editor)
            ->withHeaders($this->ifMatch('history', $entry))
            ->deleteJson("/api/v1/history/{$entry->id}")
            ->assertOk()->assertJson(['ok' => true]);
        $this->assertDatabaseMissing('history_entries', ['id' => $entry->id]);
    }

    public function test_an_update_to_nothing_is_refused_and_keeps_the_entry(): void
    {
        $entry = HistoryEntry::factory()->create(['title_fr' => 'Gardé']);

        $this->actingAsMember($this->editor)
            ->withHeaders($this->ifMatch('history', $entry))
            ->putJson("/api/v1/history/{$entry->id}", $this->payload(['titleFr' => ' ']))
            ->assertStatus(422)
            ->assertJson(['code' => 'history_entry_empty']);
        $this->assertSame('Gardé', $entry->refresh()->title_fr);
    }

    public function test_show_hands_out_the_tag_the_writes_want(): void
    {
        $entry = HistoryEntry::factory()->create();

        $tag = $this->actingAsMember($this->editor)
            ->getJson("/api/v1/history/{$entry->id}")
            ->assertOk()
            ->headers->get('ETag');

        $this->assertNotEmpty($tag);
        $this->actingAsMember($this->editor)
            ->withHeader('If-Match', $tag)
            ->putJson("/api/v1/history/{$entry->id}", $this->payload())
            ->assertOk();
    }
}
