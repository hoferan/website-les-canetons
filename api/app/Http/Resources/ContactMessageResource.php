<?php

namespace App\Http\Resources;

use App\Models\ContactMessage;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One message from the public contact form, as the committee reads it.
 *
 * The sender's own words travel raw: they were stored raw and are escaped at
 * output time by React, which escapes by default. Nothing here is translated —
 * a stranger's message is content, and `handledBy` is a person's name.
 *
 * @mixin ContactMessage
 */
class ContactMessageResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'lastName' => $this->last_name,
            'firstName' => $this->first_name,
            'email' => $this->email,
            'subject' => $this->subject,
            'message' => $this->message,
            /** When the visitor sent it. */
            'receivedAt' => Iso8601::utc($this->created_at),
            /** When somebody dealt with it, or null while it is still open. */
            'handledAt' => $this->handled_at === null ? null : Iso8601::utc($this->handled_at),
            /** Who dealt with it. Null while open, and null again if that member has since left the band. */
            'handledBy' => $this->whenLoaded(
                'handledBy',
                fn () => $this->handledBy === null
                    ? null
                    : trim($this->handledBy->first_name.' '.$this->handledBy->last_name),
                null,
            ),
        ];
    }
}
