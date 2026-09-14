<?php

namespace App\Models;

use Database\Factories\SectionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Section extends Model
{
    /** @use HasFactory<SectionFactory> */
    use HasFactory;

    protected $fillable = ['name', 'sort_order'];

    /** @return HasMany<Member, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(Member::class);
    }

    /**
     * The people who PLAY in this register and have consented to be named on
     * the public site.
     *
     * A SEPARATE RELATION RATHER THAN A SCOPE ON members(), so the public band
     * page can eager-load it by name and cannot forget the filter. Consent
     * defaults to false and most of these people are children: a public
     * endpoint that filtered in the controller would be one refactor away from
     * publishing a name nobody agreed to publish.
     *
     * @return HasMany<Member, $this>
     */
    public function publicMembers(): HasMany
    {
        return $this->members()->where('public_visible', true)->orderBy('first_name');
    }

    /**
     * The people who TEACH this register and have consented to be named.
     *
     * A different column from members(): an instructor teaches one register and
     * may play in another, so the same person can appear under two headings on
     * the band page without either being wrong.
     *
     * @return HasMany<Member, $this>
     */
    public function publicInstructors(): HasMany
    {
        return $this->hasMany(Member::class, 'instructor_of_section_id')
            ->where('public_visible', true)
            ->orderBy('first_name');
    }
}
