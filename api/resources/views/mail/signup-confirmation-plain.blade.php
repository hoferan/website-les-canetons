{{-- Unescaped on purpose: $body is already the finished plain-text message
     assembled by App\Mail\SignupConfirmation::buildBody(). It is never HTML, so
     it needs no escaping — and {{ }} would actively corrupt it, turning the
     French accents and the em-dash into HTML entities (&eacute;, &mdash;) in a
     text/plain part where nothing decodes them again. --}}
{!! $body !!}
