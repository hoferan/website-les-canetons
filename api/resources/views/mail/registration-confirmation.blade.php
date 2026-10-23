<x-mail::message>
# Inscription confirmée

Bonjour {{ $registration->first_name }},

Nous avons bien reçu votre inscription pour **{{ $event->title }}**.

{{-- A BLANK LINE BETWEEN THESE TWO, not a bare newline. Markdown reads a
     newline as a space, so as consecutive lines the two labels render as
     one wrapped paragraph in the HTML part, which is the part a mail
     client shows; only the plain-text part keeps the break. Two trailing
     spaces would do it too and do not survive: they are invisible and a
     formatter strips them. --}}
**Quand :** {{ $event->starts_at->setTimezone(\App\Support\BandTime::ZONE)->locale('fr_CH')->isoFormat('dddd D MMMM YYYY, HH:mm') }}

**Où :** {{ $event->location }}

{{-- Quantities as the order, then every other answer under its question.
     Two tables, because "Végétarien ? | Non" under a "Quantité" heading
     reads as a count. --}}
@php
    $ordered = $registration->choices->filter(fn ($choice) => $choice->quantity !== null);
    $answered = $registration->choices->filter(fn ($choice) => $choice->quantity === null);
@endphp
@if ($ordered->isNotEmpty())
<x-mail::table>
| Choix | Quantité |
| :---- | -------: |
@foreach ($ordered as $choice)
| {{ $choice->option?->label }} | {{ $choice->quantity }} |
@endforeach
</x-mail::table>
@endif

@if ($answered->isNotEmpty())
<x-mail::table>
| Question | Réponse |
| :------- | :------ |
@foreach ($answered as $choice)
| {{ $choice->option?->label }} | {{ str_replace(["\r", "\n", '|'], [' ', ' ', '/'], (string) $choice->answerText()) }} |
@endforeach
</x-mail::table>
@endif

@if ($registration->total_cents !== null)
**Total : CHF {{ number_format($registration->total_cents / 100, 2, '.', '’') }}**

Le montant est à régler sur place.
@endif

@if ($registration->table_name)
**Table :** {{ $registration->table_name }}
@endif

Pour toute modification ou annulation, répondez simplement à ce message : le
comité s’en occupe.

Merci et à bientôt,

Les Canetons de Fribourg
</x-mail::message>
