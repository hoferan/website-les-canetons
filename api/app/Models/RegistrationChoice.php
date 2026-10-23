<?php

namespace App\Models;

use App\Support\OptionKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A booking's answer to one block of the form.
 *
 * A quantity block fills `quantity`, a number and not a row per person;
 * every other input kind fills `value` (the text, the chosen answer's key, or
 * `yes`/`no`). UNIQUE(registration_id, option_id) keeps it one row per block.
 *
 * No factory: a choice cannot exist without a registration and an option, so
 * RegistrationFactory builds them through withChoice().
 *
 * @property int|null $quantity
 * @property string|null $value
 */
class RegistrationChoice extends Model
{
    protected $fillable = [
        'registration_id',
        'option_id',
        'quantity',
        'value',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
        ];
    }

    /** @return BelongsTo<Registration, $this> */
    public function registration(): BelongsTo
    {
        return $this->belongsTo(Registration::class);
    }

    /** @return BelongsTo<RegistrationOption, $this> */
    public function option(): BelongsTo
    {
        return $this->belongsTo(RegistrationOption::class, 'option_id');
    }

    /**
     * A non-quantity answer as words, for the export and the mail: the text
     * as typed, the chosen answer's current label, or Oui / Non.
     *
     * French, like every other word in those two: they are written for the
     * committee and the guest of a Fribourg band, outside web/src/i18n/.
     */
    public function answerText(): ?string
    {
        return match ($this->option?->kind) {
            OptionKind::YesNo => $this->value === 'yes' ? 'Oui' : 'Non',
            OptionKind::Choice => collect($this->option->answers())->firstWhere('id', $this->value)['label'] ?? null,
            OptionKind::Text => $this->value,
            default => null,
        };
    }
}
