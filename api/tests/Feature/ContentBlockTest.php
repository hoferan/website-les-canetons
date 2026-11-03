<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\ContentBlock;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The stored content blocks of the public pages (#106): one JSON object per
 * block key, written where the block is shown.
 */
class ContentBlockTest extends TestCase
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

    public function test_blocks_are_public_and_empty_by_default(): void
    {
        $this->getJson('/api/v1/blocks')
            ->assertStatus(200)
            ->assertJsonPath('data', [])
            ->assertJsonPath('meta.total', 0);
    }

    public function test_a_manager_stores_a_block_and_reads_it_back(): void
    {
        $data = [
            'title' => 'Rejoindre',
            'subtitle' => '',
            'cards' => [
                ['heading' => 'Cloches', 'body' => 'Tous les mardis', 'link' => ''],
                ['heading' => 'Batteurs', 'body' => 'Sur demande', 'link' => 'https://example.test/x'],
            ],
        ];

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/blocks/join.hero', ['data' => $data])
            ->assertStatus(200)
            ->assertJsonPath('block.key', 'join.hero')
            ->assertJsonPath('block.data', $data);

        $this->getJson('/api/v1/blocks')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.key', 'join.hero')
            ->assertJsonPath('data.0.data', $data)
            ->assertJsonPath('data.0.data.subtitle', '');
    }

    public function test_null_deletes_the_block(): void
    {
        $this->saveBlock('join.hero', ['title' => 'Un']);

        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/blocks/join.hero', ['data' => null])
            ->assertStatus(200)
            ->assertJsonPath('block', null);

        $this->assertSame(0, ContentBlock::query()->count());
    }

    public function test_a_second_write_replaces_the_first(): void
    {
        $this->saveBlock('join.hero', ['title' => 'Un', 'extra' => 'x']);
        $this->saveBlock('join.hero', ['title' => 'Deux']);

        $this->assertSame(1, ContentBlock::query()->count());
        $this->assertSame(['title' => 'Deux'], ContentBlock::query()->findOrFail('join.hero')->data);
    }

    public function test_shape_limits_are_refused_on_data(): void
    {
        $nest = function (int $levels): array {
            $data = ['leaf' => 'x'];
            for ($i = 1; $i < $levels; $i++) {
                $data = ['n' => $data];
            }

            return $data;
        };

        // Six levels including the root is the limit, so six is stored.
        $this->saveBlock('join.deep', $nest(6));

        $tooBig = [];
        for ($i = 0; $i < 24; $i++) {
            $tooBig['k'.$i] = array_fill(0, 24, str_repeat('a', 1999));
        }

        $bad = [
            'seven levels' => $nest(7),
            'a 25-item list' => ['items' => array_fill(0, 25, 'x')],
            'a 2001-char string' => ['title' => str_repeat('a', 2001)],
            'a bad key' => ['1x' => 'x'],
            'a bad key deep down' => ['cards' => [['bad key' => 'x']]],
            'a list instead of an object' => ['a', 'b'],
            'over 64 KB' => $tooBig,
        ];

        foreach ($bad as $label => $data) {
            $this->actingAsMember($this->manager)
                ->putJson('/api/v1/blocks/join.hero', ['data' => $data])
                ->assertStatus(400)
                ->assertJsonPath('code', 'validation_failed')
                ->assertJsonPath('errors.0.field', 'data');
        }

        $this->assertSame(['join.deep'], ContentBlock::query()->pluck('key')->all());
    }

    public function test_a_body_without_data_is_refused(): void
    {
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/blocks/join.hero', [])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'data');
    }

    public function test_a_key_outside_the_pattern_is_not_found(): void
    {
        foreach (['Join.hero', 'join..hero', 'join.hero.', '1join', str_repeat('a', 65)] as $key) {
            $this->actingAsMember($this->manager)
                ->putJson("/api/v1/blocks/{$key}", ['data' => ['title' => 'x']])
                ->assertStatus(404);
        }

        $this->assertSame(0, ContentBlock::query()->count());
    }

    public function test_writing_refuses_anonymous_and_unpermitted(): void
    {
        $this->putJson('/api/v1/blocks/join.hero', ['data' => ['title' => 'x']])
            ->assertStatus(401)->assertJson(['code' => 'not_authenticated']);

        $photosOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::ImagesManage)->create())
            ->create();
        $player = Member::factory()->inSection('Cloches')->create();

        foreach ([$photosOnly, $player] as $member) {
            $this->actingAsMember($member)
                ->putJson('/api/v1/blocks/join.hero', ['data' => ['title' => 'x']])
                ->assertStatus(403)->assertJson(['code' => 'access_denied']);
        }

        $this->assertSame(0, ContentBlock::query()->count());
    }

    public function test_the_write_is_audited(): void
    {
        $this->saveBlock('join.hero', ['title' => 'Un']);
        $this->actingAsMember($this->manager)
            ->putJson('/api/v1/blocks/join.hero', ['data' => null])
            ->assertStatus(200);

        $entries = AuditEntry::query()->orderBy('id')->get()
            ->map(fn (AuditEntry $e) => [$e->actor_member_id, $e->action, $e->target_type, $e->target_id, $e->target_label])
            ->all();

        $this->assertSame([
            [$this->manager->id, 'block.changed', 'content_block', null, 'join.hero'],
            [$this->manager->id, 'block.reset', 'content_block', null, 'join.hero'],
        ], $entries);
    }

    /** @param array<string, mixed> $data */
    private function saveBlock(string $key, array $data): void
    {
        $this->actingAsMember($this->manager)
            ->putJson("/api/v1/blocks/{$key}", ['data' => $data])
            ->assertStatus(200);
    }
}
