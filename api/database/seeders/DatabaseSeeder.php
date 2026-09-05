<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * Deliberately empty during the R1a rebuild: the old User model is gone
     * and its replacement (Member) does not exist yet — see Task 2.
     */
    public function run(): void
    {
        //
    }
}
