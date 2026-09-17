<x-mail::message>
# Nouveau message

**{{ trim($message->first_name.' '.$message->last_name) }}** a écrit via le
formulaire de contact du site.

{{-- A BLANK LINE BETWEEN EACH OF THESE THREE, not a bare newline. Markdown
     treats a newline as a space, so written as consecutive lines the three
     labels render as one wrapped paragraph in the HTML part, which is the
     part a mail client shows; only the plain-text part keeps the breaks.
     Two trailing spaces would do it too and do not survive: they are
     invisible and a formatter strips them. --}}
**Sujet :** {{ $message->subject ?: 'sans sujet' }}

**Courriel :** {{ $message->email }}

**Reçu le :** {{ $message->created_at->setTimezone(\App\Support\BandTime::ZONE)->locale('fr_CH')->isoFormat('dddd D MMMM YYYY, HH:mm') }}

---

{{ $message->message }}

---

<x-mail::button :url="rtrim(config('app.url'), '/').'/contact-messages'">
Répondre dans la boîte de réception
</x-mail::button>

Répondez depuis la boîte de réception plutôt qu’ici : le message y est
marqué comme traité, avec votre nom et la date, ce qui évite qu’une deuxième
personne du comité réponde au même expéditeur.
</x-mail::message>
