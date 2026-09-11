<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The committee's half: the guest list, correcting a booking, cancelling
 * one, editing the options, and the four exports.
 */
class GuestListTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    private Event $event;

    private RegistrationOption $meat;

    private RegistrationOption $child;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
        $this->event = Event::factory()->takingRegistrations()->create(['title' => 'Souper 2027']);
        $this->meat = RegistrationOption::factory()->create(['event_id' => $this->event->id]);
        $this->child = RegistrationOption::factory()->labelled('Menu enfant', 2000)
            ->create(['event_id' => $this->event->id, 'sort_order' => 1]);
    }

    private ?Registration $lastBooking = null;

    private function book(string $last = 'Maillard', int $meat = 2, int $child = 0): Registration
    {
        $booking = Registration::factory()->create([
            'event_id' => $this->event->id,
            'last_name' => $last,
        ]);

        if ($meat > 0) {
            RegistrationChoice::create([
                'registration_id' => $booking->id,
                'option_id' => $this->meat->id,
                'quantity' => $meat,
            ]);
        }
        if ($child > 0) {
            RegistrationChoice::create([
                'registration_id' => $booking->id,
                'option_id' => $this->child->id,
                'quantity' => $child,
            ]);
        }

        return $this->lastBooking = $booking->load('choices.option');
    }

    // ------------------------------------------------------- the list

    public function test_an_anonymous_caller_gets_401_not_403(): void
    {
        $this->getJson("/api/v1/events/{$this->event->id}/registrations")->assertStatus(401);
    }

    public function test_an_ordinary_member_cannot_read_the_guest_list(): void
    {
        // Personal data of strangers: name, email, phone, address.
        $this->actingAsMember(Member::factory()->inSection('Cloches')->create())
            ->getJson("/api/v1/events/{$this->event->id}/registrations")
            ->assertStatus(403);
    }

    public function test_registrations_view_alone_is_enough_to_read_it(): void
    {
        // PINS THE PERMISSION STRING. demo.committee holds exactly this and
        // nothing else — the role exists so somebody can look at the list.
        $this->actingAsMember(Member::factory()->committee()->create())
            ->getJson("/api/v1/events/{$this->event->id}/registrations")
            ->assertOk();
    }

    public function test_the_list_carries_what_the_screen_renders(): void
    {
        $this->book('Maillard', 3, 1);

        $entry = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$this->event->id}/registrations")
            ->assertOk()
            ->json('0');

        $this->assertSame('Maillard', $entry['lastName']);
        $this->assertSame(4, $entry['guestCount']);
        $this->assertSame(15_500, $entry['totalCents']);
        $this->assertCount(2, $entry['choices']);
        $this->assertSame('Menu viande', $entry['choices'][0]['label']);
        $this->assertSame(3, $entry['choices'][0]['quantity']);
    }

    // --------------------------------------------- correcting and cancelling

    public function test_reading_the_list_does_not_let_you_edit_it(): void
    {
        // THE WHOLE REASON registrations.manage IS A SEPARATE PERMISSION.
        // Widening registrations.view would have handed demo.committee —
        // which holds it as its only permission — the power to delete
        // strangers' bookings.
        $booking = $this->book();

        $this->actingAsMember(Member::factory()->committee()->create())
            ->patchJson("/api/v1/registrations/{$booking->id}", ['lastName' => 'Piraté'])
            ->assertStatus(403);

        $this->assertSame('Maillard', $booking->fresh()->last_name);
    }

    public function test_reading_the_list_does_not_let_you_cancel_one(): void
    {
        // The other half of the same argument, in its own test: two
        // actingAsMember calls around two requests in ONE test silently
        // lose the session on the second and answer 401, which reads as a
        // permission pass when it is nothing of the kind.
        $booking = $this->book();

        $this->actingAsMember(Member::factory()->committee()->create())
            ->deleteJson("/api/v1/registrations/{$booking->id}")
            ->assertStatus(403);

        $this->assertSame(1, Registration::query()->count());
    }

    public function test_registrations_manage_alone_is_enough_to_edit(): void
    {
        $booking = $this->book();
        $manager = Member::factory()
            ->withRole(Role::factory()->granting(Permission::RegistrationsManage)->create())
            ->create();

        $this->actingAsMember($manager)
            ->patchJson("/api/v1/registrations/{$booking->id}", ['tableName' => 'Table 4'])
            ->assertOk()
            ->assertJsonPath('tableName', 'Table 4');
    }

    public function test_editing_one_field_leaves_the_others_alone(): void
    {
        $booking = $this->book();

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/v1/registrations/{$booking->id}", ['lastName' => 'Maillard-Rossier'])
            ->assertOk();

        $fresh = $booking->fresh();
        $this->assertSame('Maillard-Rossier', $fresh->last_name);
        $this->assertSame($booking->email, $fresh->email);
        // (int) because MySQL returns SUM() as a string, and assertSame
        // is strict — a bare 2 vs '2' fails for a reason that has nothing
        // to do with what this test is about.
        $this->assertSame(2, (int) $fresh->choices()->sum('quantity'));
    }

    public function test_clearing_an_optional_field_stores_null(): void
    {
        // array_key_exists, not isset: an explicitly-sent null must clear.
        $booking = $this->book();
        $booking->update(['table_name' => 'Table 1']);

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/v1/registrations/{$booking->id}", ['tableName' => null])
            ->assertOk();

        $this->assertNull($booking->fresh()->table_name);
    }

    public function test_editing_is_audited(): void
    {
        $booking = $this->book();

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/v1/registrations/{$booking->id}", ['tableName' => 'Table 2']);

        $this->assertDatabaseHas('audit_log', [
            'action' => 'registration.updated',
            'target_type' => 'registration',
            'target_id' => $booking->id,
        ]);
    }

    public function test_cancelling_removes_the_booking_and_its_choices(): void
    {
        $booking = $this->book('Cuennet', 2, 1);

        $this->actingAsMember($this->organiser)
            ->deleteJson("/api/v1/registrations/{$booking->id}")
            ->assertOk()
            ->assertJson(['ok' => true]);

        $this->assertSame(0, Registration::query()->count());
        $this->assertSame(0, RegistrationChoice::query()->count());
        // The options survive: they belong to the event, not the booking.
        $this->assertSame(2, RegistrationOption::query()->count());
    }

    public function test_cancelling_is_audited_with_the_name_it_had(): void
    {
        $booking = $this->book('Cuennet');

        $this->actingAsMember($this->organiser)->deleteJson("/api/v1/registrations/{$booking->id}");

        $this->assertDatabaseHas('audit_log', [
            'action' => 'registration.deleted',
            'target_label' => $booking->fullName(),
        ]);
    }

    // ----------------------------------------------------------- the options

    public function test_the_options_editor_is_events_manage_not_a_registration_permission(): void
    {
        // Configuring what an event offers is configuring the event.
        $manager = Member::factory()
            ->withRole(Role::factory()->granting(Permission::RegistrationsManage)->create())
            ->create();

        $this->actingAsMember($manager)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", ['options' => []])
            ->assertStatus(403);
    }

    public function test_replacing_the_options_creates_updates_and_deletes(): void
    {
        $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", [
                'options' => [
                    // kept and renamed
                    ['id' => $this->meat->id, 'label' => 'Menu carnivore', 'priceCents' => 4800],
                    // new
                    ['label' => 'Menu végétarien', 'priceCents' => 4200],
                    // $this->child is absent, so it goes
                ],
            ])
            ->assertOk()
            ->assertJsonCount(2);

        $labels = RegistrationOption::query()->orderBy('sort_order')->pluck('label')->all();
        $this->assertSame(['Menu carnivore', 'Menu végétarien'], $labels);
        $this->assertSame(4800, $this->meat->fresh()->price_cents);
    }

    public function test_an_option_somebody_booked_cannot_be_removed(): void
    {
        // RESTRICT would make the database refuse anyway — but with a 500
        // halfway through the transaction, after the committee's other
        // edits were already applied. This refuses first, and names it.
        $this->book('Maillard', 2, 0);

        $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", ['options' => []])
            ->assertStatus(409)
            ->assertJson(['code' => 'option_has_registrations']);

        // And nothing was changed: not even the unbooked one went.
        $this->assertSame(2, RegistrationOption::query()->count());
    }

    public function test_an_unbooked_option_beside_a_booked_one_still_goes(): void
    {
        $this->book('Maillard', 2, 0);

        $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", [
                'options' => [['id' => $this->meat->id, 'label' => 'Menu viande', 'priceCents' => 4500]],
            ])
            ->assertOk();

        $this->assertSame(1, RegistrationOption::query()->count());
    }

    // --------------------------------------------------------- the exports

    public function test_every_format_agrees_on_the_rows(): void
    {
        // ONE ROW-BUILDER, FOUR FORMATTERS. Four exporters each walking the
        // models would drift the first time somebody added a column, and
        // every file would still open — only the numbers would differ.
        $this->book('Maillard', 3, 1);
        $this->book('Rossier', 1, 0);

        $json = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$this->event->id}/registrations.json")
            ->assertOk()
            ->json();

        $csv = $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.csv")
            ->assertOk()
            ->getContent();

        $md = $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.md")
            ->assertOk()
            ->getContent();

        // Every header appears in both text formats.
        foreach ($json['headers'] as $header) {
            $this->assertStringContainsString($header, $csv);
            $this->assertStringContainsString($header, $md);
        }

        // And both guests, in both.
        foreach (['Maillard', 'Rossier'] as $name) {
            $this->assertStringContainsString($name, $csv);
            $this->assertStringContainsString($name, $md);
        }

        $this->assertCount(2, $json['rows']);
    }

    public function test_the_export_has_a_column_per_option_and_a_totals_row(): void
    {
        // What the kitchen counts.
        $this->book('Maillard', 3, 1);
        $this->book('Rossier', 1, 0);

        $json = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$this->event->id}/registrations.json")
            ->assertOk()
            ->json();

        $this->assertContains('Menu viande', $json['headers']);
        $this->assertContains('Menu enfant', $json['headers']);

        $viande = array_search('Menu viande', $json['headers'], true);
        $enfant = array_search('Menu enfant', $json['headers'], true);

        $this->assertSame(4, $json['totals'][$viande]);
        $this->assertSame(1, $json['totals'][$enfant]);

        // An option a booking did not take is 0, not blank: a column of
        // blanks and numbers does not sum, and summing it is the point.
        $this->assertSame(0, $json['rows'][1][$enfant]);
    }

    public function test_the_csv_carries_a_bom_and_semicolons(): void
    {
        // Excel on Windows reads a BOM-less UTF-8 CSV as the system
        // codepage and turns "Répétition" into "RÃ©pÃ©tition" — for a French
        // guest list full of names that is the difference between a usable
        // file and a useless one. Semicolons because Swiss Excel expects
        // them; a comma file opens as one column.
        $this->book();

        $csv = $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.csv")
            ->assertOk()
            ->getContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString('Nom;Prénom;', $csv);
    }

    public function test_the_xlsx_is_a_real_workbook(): void
    {
        $this->book();

        $response = $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.xlsx")
            ->assertOk();

        $this->assertSame(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            $response->headers->get('Content-Type')
        );

        // A xlsx is a zip: "PK" is its magic number. Cheap, and it proves
        // openspout actually wrote a container rather than an error page.
        $this->assertStringStartsWith('PK', $response->streamedContent());
    }

    public function test_the_filename_is_derived_from_the_event(): void
    {
        $response = $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.csv")
            ->assertOk();

        $this->assertStringContainsString(
            'souper-2027-inscriptions.csv',
            (string) $response->headers->get('Content-Disposition')
        );
    }

    public function test_an_unknown_format_is_a_404_from_the_router(): void
    {
        $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.pdf")
            ->assertStatus(404);
    }

    public function test_the_exports_need_the_same_permission_as_the_list(): void
    {
        $player = Member::factory()->inSection('Cloches')->create();

        foreach (['xlsx', 'csv', 'md', 'json'] as $format) {
            $this->actingAsMember($player)
                ->get("/api/v1/events/{$this->event->id}/registrations.{$format}")
                ->assertStatus(403);
        }
    }

    public function test_the_export_rows_are_positional_and_carry_the_right_values(): void
    {
        // THE CONTRACT GuestList EXISTS FOR. Its docblock says the four
        // formats must not disagree and that rows() is "positional against
        // headers()", and until 2026-09-10 nothing checked either: swapping
        // Nom and Prénom, hard-coding the guest total to 0, and a 100x
        // money error (round($cents, 2) instead of $cents / 100) all left
        // this file green, because the assertions only looked for strings
        // somewhere in the output.
        $this->book('Maillard', 3, 1);

        $json = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$this->event->id}/registrations.json")
            ->assertOk()
            ->json();

        $at = fn (string $header): int => (int) array_search($header, $json['headers'], true);
        $row = $json['rows'][0];

        // Identity, in the right columns and the right way round.
        $this->assertSame('Maillard', $row[$at('Nom')]);
        $this->assertSame($this->lastBooking->first_name, $row[$at('Prénom')]);
        $this->assertSame($this->lastBooking->email, $row[$at('E-mail')]);
        $this->assertSame('079 322 12 57', $row[$at('Téléphone')]);

        // Quantities under their own option's column.
        $this->assertSame(3, $row[$at('Menu viande')]);
        $this->assertSame(1, $row[$at('Menu enfant')]);

        // Four people, and 3 x 45.- plus 1 x 20.- in FRANCS, not centimes.
        $this->assertSame(4, $row[$at('Personnes')]);
        // (float) because JSON has no int/float distinction: a whole
        // 155.0 decodes as int(155), which assertSame rejects on type.
        $this->assertSame(155.0, (float) $row[$at('Total CHF')]);
    }

    public function test_the_totals_row_is_what_the_caterer_is_told(): void
    {
        $this->book('Maillard', 3, 1);
        $this->book('Rossier', 1, 0);

        $json = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$this->event->id}/registrations.json")
            ->assertOk()
            ->json();

        $at = fn (string $header): int => (int) array_search($header, $json['headers'], true);
        $totals = $json['totals'];

        $this->assertSame(4, $totals[$at('Menu viande')]);
        $this->assertSame(1, $totals[$at('Menu enfant')]);
        $this->assertSame(5, $totals[$at('Personnes')]);
        // 155.- plus 45.- .
        $this->assertSame(200.0, (float) $totals[$at('Total CHF')]);
    }

    public function test_the_csv_and_markdown_carry_the_same_values_in_the_same_order(): void
    {
        // Presence is not agreement: the formats could each contain every
        // header and still put them in a different order, or read a
        // different column. This compares the rendered first data row
        // against the JSON row, cell for cell.
        $this->book('Maillard', 3, 1);

        $json = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$this->event->id}/registrations.json")
            ->assertOk()
            ->json();

        $csv = $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.csv")
            ->assertOk()
            ->getContent();

        $md = $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.md")
            ->assertOk()
            ->getContent();

        $csvRow = str_getcsv(explode("\n", trim($csv))[1], ';');
        $mdRow = array_map('trim', explode('|', trim(explode("\n", trim($md))[2], "| \r")));

        foreach ($json['rows'][0] as $index => $value) {
            $expected = $value === null ? '' : (string) $value;
            $this->assertSame($expected, $csvRow[$index], "CSV column {$index} disagrees");
            $this->assertSame($expected, $mdRow[$index], "Markdown column {$index} disagrees");
        }
    }

    public function test_replacing_the_options_twice_converges(): void
    {
        // PUT MEANS IDEMPOTENT, and the first save is where that is hard:
        // no entry carries an id yet. A naive delete-then-create renumbers
        // every option on a retry, and if a booking landed in between the
        // retry answers option_has_registrations and loses the whole edit.
        $body = ['options' => [
            ['label' => 'Menu carnivore', 'priceCents' => 4800],
            ['label' => 'Menu végétarien', 'priceCents' => 4200],
        ]];

        $first = $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", $body)
            ->assertOk()
            ->json();

        $second = $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", $body)
            ->assertOk()
            ->json();

        // Same rows, same ids, same count. A retry changes nothing.
        $this->assertSame(array_column($first, 'id'), array_column($second, 'id'));
        $this->assertSame(2, RegistrationOption::query()->count());
    }

    public function test_a_retried_first_save_does_not_orphan_a_booking(): void
    {
        // The failure the idempotence exists to prevent, end to end.
        $body = ['options' => [['label' => 'Menu unique', 'priceCents' => 4500]]];

        $created = $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", $body)
            ->assertOk()
            ->json();

        $option = RegistrationOption::query()->findOrFail($created[0]['id']);
        Registration::factory()->withChoice($option)->create(['event_id' => $this->event->id]);

        // The client never saw the first response and sends it again.
        $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", $body)
            ->assertOk();

        $this->assertSame(1, RegistrationOption::query()->count());
        $this->assertSame(1, RegistrationChoice::query()->count());
    }

    public function test_a_formula_in_a_guest_name_is_defused_in_the_csv(): void
    {
        // Every identity column comes from the PUBLIC form and is validated
        // only as a string, so a booking under this name is a live formula
        // the moment a committee member opens the file.
        Registration::factory()->create([
            'event_id' => $this->event->id,
            'last_name' => '=HYPERLINK("https://evil.example","cliquez")',
        ]);

        $csv = $this->actingAsMember($this->organiser)
            ->get("/api/v1/events/{$this->event->id}/registrations.csv")
            ->assertOk()
            ->getContent();

        $this->assertStringContainsString('\'=HYPERLINK', $csv);
        $this->assertStringNotContainsString(';=HYPERLINK', $csv);
    }

    public function test_the_exports_need_registrations_view_specifically(): void
    {
        // PINS THE PERMISSION STRING. The old test only proved a member
        // with NO permissions is refused, which cannot tell one string
        // from another.
        $organiser = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        foreach (['xlsx', 'csv', 'md', 'json'] as $format) {
            $this->actingAsMember($organiser)
                ->get("/api/v1/events/{$this->event->id}/registrations.{$format}")
                ->assertStatus(403);
        }
    }
}
