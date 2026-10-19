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

    protected $fillable = ['name', 'name_de', 'sort_order'];

    /** @return HasMany<Member, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(Member::class);
    }

    /**
     * Everybody who teaches this register, consenting or not. A delete
     * counts them, because removing the register would take it from each.
     *
     * @return HasMany<Member, $this>
     */
    public function instructors(): HasMany
    {
        return $this->hasMany(Member::class, 'instructor_of_section_id');
    }

    /**
     * The people who play in this register and have consented to be named on
     * the public site.
     *
     * A separate relation rather than a scope on members(), so the public band
     * page eager-loads it by name and cannot forget the filter. Consent
     * defaults to false and most of these people are children.
     *
     * @return HasMany<Member, $this>
     */
    public function publicMembers(): HasMany
    {
        return $this->members()->where('public_visible', true)->orderBy('first_name');
    }

    /**
     * The people who teach this register and have consented to be named.
     *
     * A different column from members(): an instructor teaches one register
     * and may play in another, so a person can appear under two headings.
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
