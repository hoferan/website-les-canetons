<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The history the site carried before it could be edited (#104).
 *
 * ONLY INTO AN EMPTY TABLE. Once the committee has written one entry the
 * history is theirs, and a later deploy must not add these back beside it.
 *
 * The text is the old page's, moved rather than rewritten. Its opening
 * paragraph was in unaccented capitals and repeated the third one; its first
 * sentence is kept here in sentence case and the repetition is dropped. The
 * dates of 2007 and 2026 are read from "saison 2007/2008" and from the
 * handover being "à présent", seven years after 2019.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('history_entries')->exists()) {
            return;
        }

        // The old page set a non-breaking space inside « » and before "!".
        $nb = "\u{00A0}";
        $now = now();

        $row = fn (string $on, string $precision, bool $important, ?string $icon, ?string $title, string $body): array => [
            'occurred_on' => $on,
            'precision' => $precision,
            'important' => $important,
            'icon' => $icon,
            'title_fr' => $title,
            'body_fr' => $body,
            'title_de' => null,
            'body_de' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ];

        DB::table('history_entries')->insert([
            $row('2002-10-01', 'month', true, 'flag', 'Les débuts',
                "La guggen d’enfants «{$nb}Les Canetons{$nb}» de Fribourg s’est officiellement créée en octobre 2002. "
                ."En remarquant l’engouement de plusieurs gamins qui suivaient les «{$nb}3 Canards{$nb}» et qui "
                .'rêvaient de mettre de l’ambiance comme eux, il n’en fallut pas plus pour que Jacky Schaller '
                ."accepte de prendre la direction de ces petits hyper motivés{$nb}!"
                ."\n\n"
                .'Débutant avec une dizaine de musiciens, sans vraiment recruter, jouant uniquement la carte du '
                ."«{$nb}bouche à oreilles{$nb}», cette jeune guggen s’est vite retrouvée avec une quarantaine d’enfants, "
                .'âgés de 7 à 18 ans. Pas besoin de connaître la musique pour s’intégrer au groupe... Des '
                .'moniteurs apprennent les morceaux aux jeunes, registre par registre, lors des répétitions qui '
                .'ont lieu, en général, le samedi matin.'),
            $row('2007-01-01', 'year', false, null, null,
                'Dès la saison 2007/2008, les Directeurs (tous d’anciens Canetons) se sont succédé. Tout '
                .'d’abord Anthony Cotting, puis Delphine Brügger et Fabio Portmann.'),
            $row('2019-01-01', 'year', false, 'music', 'Delphine Maillard et Laura Mantel',
                'Depuis 2019, les Canetons ont été dirigés par Delphine Maillard et Laura Mantel.'),
            $row('2026-01-01', 'year', false, 'users', 'Le flambeau passe',
                'Après sept années d’un engagement remarquable, elles passent à présent le flambeau à deux '
                .'jeunes musiciennes, Lilou Keller et Anaïs Meuwly. Toutes deux débordent d’énergie et de '
                .'motivation, prêtes à poursuivre l’aventure et à insuffler un nouvel élan à cette '
                .'merveilleuse Guggen.'),
        ]);
    }

    /** Removes nothing: by now the rows may be the committee's. */
    public function down(): void {}
};
