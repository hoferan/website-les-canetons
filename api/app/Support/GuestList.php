<?php

namespace App\Support;

use App\Models\Event;
use App\Models\Registration;
use App\Models\RegistrationOption;
use Illuminate\Support\Collection;

/**
 * The guest list as rows: one definition for four formats.
 *
 * XLSX, CSV, Markdown and JSON must not be able to disagree about what a guest
 * list contains. Four formatters each walking the models would drift as soon
 * as somebody added a column to one, and invisibly: every export would still
 * open, and only the numbers would differ. Each formatter renders this array
 * and nothing else.
 *
 * One column per block a guest answers, because that is what the kitchen
 * counts. A booking of "3 x viande, 1 x enfant" is one row with a 3 under
 * Viande and a 1 under Enfant, and the totals row at the bottom is the order
 * the committee gives the caterer. Text, choice and yes/no columns hold the
 * answer as words and total nothing. Headings and paragraphs have no column.
 */
final class GuestList
{
    /** Whether any block counts people; without one, the people column stays blank. */
    private readonly bool $countsGuests;

    /**
     * @param  Collection<int, Registration>  $registrations
     * @param  Collection<int, RegistrationOption>  $options  the answered blocks only
     */
    public function __construct(
        private readonly Event $event,
        private readonly Collection $registrations,
        private readonly Collection $options,
    ) {
        $this->countsGuests = $options->contains(fn (RegistrationOption $o): bool => $o->counts_guests);
    }

    public static function for(Event $event): self
    {
        return new self(
            $event,
            $event->registrations()->with('choices.option')->orderBy('created_at')->get(),
            $event->registrationOptions()->get()
                ->filter(fn (RegistrationOption $o): bool => $o->kind->isInput())
                ->values(),
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
            ['Personnes', 'Total CHF', 'Payé le', 'Inscrit le'],
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
            $answers = $registration->choices->keyBy('option_id');

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
                    // 0, not null, for a quantity this booking did not take:
                    // a spreadsheet column of blanks and numbers does not
                    // sum, and summing it is the whole point.
                    fn (RegistrationOption $o): int|string|null => $o->kind === OptionKind::Quantity
                        ? ($answers->get($o->id)->quantity ?? 0)
                        : $answers->get($o->id)?->answerText()
                )->all(),
                [
                    $this->countsGuests ? $registration->guest_count : null,
                    self::francs($registration->total_cents),
                    // Null while unpaid, so the column stays blank until
                    // money arrives.
                    $registration->paid_at?->setTimezone(BandTime::ZONE)->format('d.m.Y H:i'),
                    $registration->created_at->setTimezone(BandTime::ZONE)->format('d.m.Y H:i'),
                ],
            );
        })->all();
    }

    /**
     * The closing totals row: what the caterer is told.
     *
     * @return list<string|int|float|null>
     */
    public function totals(): array
    {
        // Tallied in one pass rather than searching every booking's choices
        // once per option, which would be O(bookings x options).
        $tally = [];
        foreach ($this->registrations as $registration) {
            foreach ($registration->choices as $choice) {
                $tally[$choice->option_id] = ($tally[$choice->option_id] ?? 0) + (int) $choice->quantity;
            }
        }

        // An answer column totals nothing: a count of "Oui" is on the screen,
        // and a sum of words would be a blank cell anyway.
        $perOption = $this->options
            ->map(fn (RegistrationOption $option): int|string => $option->kind === OptionKind::Quantity
                ? ($tally[$option->id] ?? 0)
                : '')
            ->all();

        $totalCents = $this->registrations
            ->map(fn (Registration $r): ?int => $r->total_cents)
            ->filter(fn (?int $cents) => $cents !== null);

        return array_merge(
            ['Total', '', '', '', '', ''],
            $perOption,
            [
                $this->countsGuests ? (int) $this->registrations->sum(fn (Registration $r) => $r->guest_count) : null,
                $totalCents->isEmpty() ? null : self::francs((int) $totalCents->sum()),
                '',
                '',
            ],
        );
    }

    /**
     * Centimes to francs, as a number so a spreadsheet can sum the column.
     *
     * Null stays null: a booking of unpriced options owes an unknown amount,
     * not zero, and 0.00 in a money column would be read as "paid nothing".
     */
    private static function francs(?int $cents): ?float
    {
        return $cents === null ? null : round($cents / 100, 2);
    }
}
