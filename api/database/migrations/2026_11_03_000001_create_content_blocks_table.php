<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The content blocks of the public pages that the band has changed (#106): one
 * row per block key, holding the block's data as one JSON object.
 *
 * The key names the block in the SPA, such as `join.hero`. The SPA ships the
 * default content, so a key with no row shows what the code ships with, and
 * the server never needs to know which blocks exist or what is in them: the
 * shape of `data` belongs to the component that renders it. Same reasoning as
 * photo_slots, so a new editable block is a component and nothing here.
 *
 * A row is made by the first write and deleted when the block is reset, so
 * "back to the original" leaves nothing behind.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('content_blocks')) {
            Schema::create('content_blocks', function (Blueprint $table) {
                $table->string('key', 64)->primary();
                $table->json('data');
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('content_blocks');
    }
};
