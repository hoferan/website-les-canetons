<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where library images are shown (#105): one row per photo slot.
 *
 * A slot is any place on the site that shows one photo, named by a key the
 * page chooses: `band`, `godparents`, `register-5`, `history-12`, or a GUID.
 * The key is the whole contract, so a new place for a photo needs a component
 * on a page and nothing here. An empty slot has no row, and a row is made by
 * the first placement in its slot.
 *
 * THE FOREIGN KEY IS RESTRICT and `image_id` is never null. Deleting an image
 * that some slot still shows would leave a hole in a public page, so the
 * database refuses it whatever the slot is, and the controller turns that
 * refusal into a readable one.
 *
 * `label` and `path` are what the library shows for the usage: the page's own
 * name for the slot and the page it is on. The page sends them with each
 * placement, because the server cannot name a slot it has never heard of.
 *
 * ONE GUARD PER STATEMENT. MariaDB commits every DDL statement on its own, and
 * this runs on the first request after a deploy, where a worker can be killed
 * part way through. The table and its key are checked for separately, so a
 * table made without its key gets the key on the next run.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('photo_slots')) {
            Schema::create('photo_slots', function (Blueprint $table) {
                $table->string('slot', 64)->primary();
                $table->unsignedBigInteger('image_id');
                $table->string('label', 120)->nullable();
                $table->string('path', 255)->nullable();
                $table->timestamps();
            });
        }

        if (! $this->hasImageForeignKey()) {
            Schema::table('photo_slots', function (Blueprint $table) {
                $table->foreign('image_id')->references('id')->on('images')->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('photo_slots');
    }

    private function hasImageForeignKey(): bool
    {
        foreach (Schema::getForeignKeys('photo_slots') as $key) {
            if ($key['columns'] === ['image_id']) {
                return true;
            }
        }

        return false;
    }
};
