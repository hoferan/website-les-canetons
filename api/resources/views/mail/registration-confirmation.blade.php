<x-mail::message>
# Inscription confirmée

Bonjour {{ $registration->first_name }},

Nous avons bien reçu votre inscription pour **{{ $event->title }}**.

**Quand :** {{ $event->starts_at->setTimezone(\App\Support\BandTime::ZONE)->locale('fr_CH')->isoFormat('dddd D MMMM YYYY, HH:mm') }}
**Où :** {{ $event->location }}

@if ($registration->choices->isNotEmpty())
<x-mail::table>
| Choix | Quantité |
| :---- | -------: |
@foreach ($registration->choices as $choice)
| {{ $choice->option?->label }} | {{ $choice->quantity }} |
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
