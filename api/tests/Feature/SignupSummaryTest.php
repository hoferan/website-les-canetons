<?php

namespace Tests\Feature;

use App\Models\Signup;
use App\Models\User;
use App\Support\Occasion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /api/signups — the admin summary (JSON) and its xlsx export.
 *
 * Three properties are pinned here beyond the happy path:
 *   1. view_summary is admin-only — `user`/`moderator` may respond but must
 *      never see who reserved what, and an anonymous caller gets 401 not 403;
 *   2. only the ACTIVE occasion's signups are counted (the old SQL filtered on
 *      `occasion`, so a past occasion's rows must not inflate the totals);
 *   3. the export really is a spreadsheet AND its formula-injection
 *      neutralisation survives the whole HTTP path — the admin opening the
 *      file is the target of that attack, so it is asserted on the bytes that
 *      actually arrive, not on SignupStats in isolation.
 */
class SignupSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create(['username' => 'demo.admin', 'password' => 'x', 'role' => 'admin']);
    }

    /** @param  string[]  $menus */
    private function signup(string $tableName, array $menus, array $overrides = []): Signup
    {
        return Signup::create($overrides + [
            'occasion' => Occasion::ACTIVE,
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'address' => 'Rue du Test 1, 1700 Fribourg',
            'phone' => '+41 79 000 00 00',
            'email' => 'ada@example.com',
            'table_name' => $tableName,
            'menus' => $menus,
        ]);
    }

    public function test_an_admin_gets_the_totals_and_the_occasion(): void
    {
        // Inserted in the reverse of their table_name order, so the response
        // also pins the old query's ORDER BY table_name, id.
        $this->signup('Table B', ['meat', 'child']);
        $this->signup('Table A', ['vegetarian']);

        $response = $this->actingAs($this->admin())->getJson('/api/signups');

        $response->assertOk()
            ->assertJsonPath('totalPersons', 3)
            ->assertJsonPath('totalTables', 2)
            ->assertJsonPath('menuTotals', ['meat' => 1, 'child' => 1, 'vegetarian' => 1])
            ->assertJsonPath('occasion.title', 'Souper des 25 ans des Canetons')
            // First-seen table order follows the query's ORDER BY, not insertion.
            ->assertJsonPath('tables.0.name', 'Table A')
            ->assertJsonPath('tables.1.name', 'Table B')
            ->assertJsonPath('tables.1.personCount', 2)
            ->assertJsonPath('tables.1.signups.0.email', 'ada@example.com');
    }

    public function test_only_the_active_occasion_is_counted(): void
    {
        $this->signup('Table A', ['meat']);
        $this->signup('Old table', ['meat', 'child'], ['occasion' => 'some-past-occasion']);

        $this->actingAs($this->admin())->getJson('/api/signups')
            ->assertOk()
            ->assertJsonPath('totalPersons', 1)
            ->assertJsonPath('totalTables', 1)
            ->assertJsonPath('tables.0.name', 'Table A');
    }

    public function test_a_user_role_may_not_see_the_summary(): void
    {
        // user and moderator hold `respond` only — the matrix is not a hierarchy.
        $user = User::create(['username' => 'demo.user', 'password' => 'x', 'role' => 'user']);

        $this->actingAs($user)->getJson('/api/signups')
            ->assertStatus(403)
            ->assertExactJson(['error' => 'Access denied', 'code' => 'access_denied']);
    }

    public function test_an_anonymous_caller_is_unauthenticated(): void
    {
        $this->getJson('/api/signups')
            ->assertStatus(401)
            ->assertExactJson(['error' => 'Not authenticated', 'code' => 'not_authenticated']);
    }

    public function test_the_xlsx_export_is_downloaded_as_a_spreadsheet(): void
    {
        $this->signup('Table A', ['meat', 'child']);

        $response = $this->actingAs($this->admin())->get('/api/signups?format=xlsx');

        $response->assertOk();
        $this->assertStringContainsString(
            'spreadsheetml.sheet',
            $response->headers->get('Content-Type')
        );
        $this->assertStringContainsString(
            'inscriptions-souper.xlsx',
            $response->headers->get('Content-Disposition')
        );
        // A ZIP container — anything else is not an openable xlsx, whatever the
        // headers claim.
        $this->assertStringStartsWith('PK', $response->streamedContent());
    }

    public function test_the_export_neutralizes_formula_injection_end_to_end(): void
    {
        $this->signup('=SUM(1+1)', ['meat'], ['last_name' => '=cmd|calc']);

        $response = $this->actingAs($this->admin())->get('/api/signups?format=xlsx');

        $strings = $this->sharedStrings($response->streamedContent());

        // Stored as text (leading apostrophe), never as a live formula.
        $this->assertContains("'=SUM(1+1)", $strings);
        $this->assertContains("'=cmd|calc", $strings);
        $this->assertNotContains('=SUM(1+1)', $strings);
        // Proof the archive is a real, readable spreadsheet and not just ZIP
        // bytes: the header row round-trips out of it.
        $this->assertContains('Table', $strings);
    }

    /**
     * Read an xlsx's shared-string table back out of the downloaded bytes, so
     * assertions are made on the file an admin would actually open.
     *
     * @return string[]
     */
    private function sharedStrings(string $xlsx): array
    {
        $doc = simplexml_load_string($this->zipEntry($xlsx, 'xl/sharedStrings.xml'));
        $this->assertNotFalse($doc, 'xl/sharedStrings.xml is not well-formed XML');

        return array_map(
            static fn ($si) => (string) $si->t,
            iterator_to_array($doc->si, false)
        );
    }

    /**
     * Extract one member from a ZIP archive held in memory.
     *
     * Hand-rolled because ext-zip is NOT installed in this container (nor is it
     * a requirement of shuchkin/simplexlsxgen, which writes ZIP by hand), so
     * ZipArchive and the zip:// wrapper are both unavailable. Walking the local
     * file headers is enough here: that writer sets bit flag 0 and writes real
     * sizes into every header, so there are no data descriptors to chase.
     */
    private function zipEntry(string $zip, string $name): string
    {
        $offset = 0;
        while (substr($zip, $offset, 4) === "PK\x03\x04") {
            $h = unpack(
                'vversion/vflag/vmethod/Vtime/Vcrc/Vcsize/Vusize/vnamelen/vextralen',
                substr($zip, $offset + 4, 26)
            );
            $entry = substr($zip, $offset + 30, $h['namelen']);
            $at = $offset + 30 + $h['namelen'] + $h['extralen'];
            if ($entry === $name) {
                $data = substr($zip, $at, $h['csize']);
                // 8 = deflate, 0 = stored (this writer stores members < 256 B).
                $data = $h['method'] === 8 ? gzinflate($data) : $data;
                $this->assertNotFalse($data, "could not inflate {$name}");
                $this->assertSame($h['crc'], crc32($data), "CRC mismatch on {$name}");

                return $data;
            }
            $offset = $at + $h['csize'];
        }

        $this->fail("the downloaded xlsx has no ZIP member named {$name}");
    }
}
