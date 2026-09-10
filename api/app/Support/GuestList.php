<?php

namespace App\Support;

use App\Models\Event;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use Illuminate\Support\Collection;

/**
 * The guest list, as rows — ONE definition, four formats.
 *
 * WHY THIS EXISTS RATHER THAN FOUR EXPORTERS. XLSX, CSV, Markdown and JSON
 * must not be able to disagree about what a guest list contains. Four
 * formatters each walking the models would drift the first time somebody
 * added a column to one of them, and the drift would be invisible: every
 * export would still open, and only the numbers would differ. Each formatter
 * here renders the same array and nothing else.
 *
 * ONE COLUMN PER OPTION, because that is what the kitchen counts. A booking
 * of "3 x viande, 1 x enfant" is one row with a 3 under Viande and a 1 under
 * Enfant, and the totals row at the bottom is the order the committee gives
 * the caterer.
 */
final class GuestList
{
    /**
     * @param  Collection<int, Registration>  $registrations
     * @param  Collection<int, RegistrationOption>  $options
     */
    public function __construct(
        private readonly Event $event,
        private readonly Collection $registrations,
        private readonly Collection $options,
    ) {}

    public static function for(Event $event): self
    {
        return new self(
            $event,
            $event->registrations()->with('choices.option')->orderBy('created_at')->get(),
            $event->registrationOptions()->get(),
        );
    }

    /** The filename stem, e.g. `souper-2027-inscriptions`. */
    public function filename(): string
    {
        $slug = strtolower((string) preg_replace('/[^A-Za-z0-9]+/', '-', $this->event->title));

        return trim($slug, '-').'-inscriptions';
    }

    /**
     * The header row, in the same order as every data row.
     *
     * @return list<string>
     */
    public function headers(): array
    {
        return array_merge(
            ['Nom', 'Prénom', 'E-mail', 'Téléphone', 'Adresse', 'Table'],
            $this->options->map(fn (RegistrationOption $o): string => $o->label)->all(),
            ['Personnes', 'Total CHF', 'Inscrit le'],
        );
    }

    /**
     * One row per booking, values positional against headers().
     *
     * @return list<list<string|int|float|null>>
     */
    public function rows(): array
    {
        return $this->registrations->map(function (Registration $registration): array {
            $quantities = $registration->choices
                ->keyBy('option_id')
                ->map(fn (RegistrationChoice $choice): int => $choice->quantity);

            return array_merge(
                [
                    $registration->last_name,
                    $registration->first_name,
                    $registration->email,
                    $registration->phone,
                    $registration->address,
                    $registration->table_name,
                ],
                $this->options->map(
                    // 0, not null, for an option this booking did not take:
                    // a spreadsheet column of blanks and numbers does not
                    // sum, and summing it is the whole point.
                    fn (RegistrationOption $o): int => $quantities->get($o->id, 0)
                )->all(),
                [
                    $registration->guest_count,
                    self::francs($registration->total_cents),
                    $registration->created_at->setTimezone(BandTime::ZONE)->format('d.m.Y H:i'),
                ],
            );
        })->all();
    }

    /**
     * The closing totals row — what the caterer is actually told.
     *
     * @return list<string|int|float|null>
     */
    public function totals(): array
    {
        // Tallied in ONE pass rather than searching every booking's choices
        // once per option, which is O(bookings x options) — small today at
        // ~100 bookings and three menus, and the kind of shape that is never
        // revisited once it works.
        $tally = [];
        foreach ($this->registrations as $registration) {
            foreach ($registration->choices as $choice) {
                $tally[$choice->option_id] = ($tally[$choice->option_id] ?? 0) + $choice->quantity;
            }
        }

        $perOption = $this->options
            ->map(fn (RegistrationOption $option): int => $tally[$option->id] ?? 0)
            ->all();

        $totalCents = $this->registrations
            ->map(fn (Registration $r): ?int => $r->total_cents)
            ->filter(fn (?int $cents) => $cents !== null);

        return array_merge(
            ['Total', '', '', '', '', ''],
            $perOption,
            [
                (int) $this->registrations->sum(fn (Registration $r) => $r->guest_count),
                $totalCents->isEmpty() ? null : self::francs((int) $totalCents->sum()),
                '',
            ],
        );
    }

    /**
     * Centimes to francs, as a NUMBER so a spreadsheet can sum the column.
     *
     * Null stays null: a booking of unpriced options owes an unknown amount,
     * not zero, and 0.00 in a money column would be read as "paid nothing".
     */
    private static function francs(?int $cents): ?float
    {
        return $cents === null ? null : round($cents / 100, 2);
    }
}
