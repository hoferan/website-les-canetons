<x-mail::message>
# Nouveau message

**{{ trim($message->first_name.' '.$message->last_name) }}** a écrit via le
formulaire de contact du site.

**Sujet :** {{ $message->subject ?: 'sans sujet' }}
**Courriel :** {{ $message->email }}
**Reçu le :** {{ $message->created_at->setTimezone(\App\Support\BandTime::ZONE)->locale('fr_CH')->isoFormat('dddd D MMMM YYYY, HH:mm') }}

---

{{ $message->message }}

---

Répondez directement à ce message : il part vers l’adresse ci-dessus.

Les messages reçus se trouvent aussi dans la boîte de réception du comité.
</x-mail::message>
