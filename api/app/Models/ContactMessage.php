<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContactMessage extends Model
{
    protected $fillable = ['last_name', 'first_name', 'email', 'subject', 'message'];
}
