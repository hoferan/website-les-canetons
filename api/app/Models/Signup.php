<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Signup extends Model
{
    protected $fillable = [
        'occasion', 'first_name', 'last_name', 'address',
        'phone', 'email', 'table_name', 'menus',
    ];

    // The column is TEXT holding a JSON array (the old app wrote it with
    // json_encode); 'array' keeps that wire format byte-compatible.
    protected function casts(): array
    {
        return ['menus' => 'array'];
    }
}
