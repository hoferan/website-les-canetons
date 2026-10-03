<?php

namespace App\Http\Requests\Concerns;

use App\Support\Permission;
use Illuminate\Auth\Access\AuthorizationException;

/**
 * Changing a photo, or the alt text that describes it, needs `images.manage`
 * on top of whatever the route already asks for.
 *
 * The check is on a key being present, not on its value: a save that leaves
 * all of `imageId`, `imageAltFr` and `imageAltDe` out keeps the photo as it is
 * and needs nothing extra, so a form that edits a name or a date works for
 * someone who never touches the library. Sending `null` changes the photo too,
 * so it is gated like any other value.
 *
 * A request calls this from `prepareForValidation()`, so the 403 comes before
 * validation and an editor without the permission never learns which ids
 * exist. It is not `authorize()` on purpose: Scramble documents an
 * `authorize()` as its own 403 response and drops the shared problem document
 * for that operation. The exception is the one `RequirePermission` throws, so
 * the answer is the usual `access_denied`.
 */
trait RequiresImagesManageToPlacePhoto
{
    /** @throws AuthorizationException */
    protected function requireImagesManageWhenPlacingPhoto(): void
    {
        if ($this->hasAny(['imageId', 'imageAltFr', 'imageAltDe'])
            && $this->user()?->hasPermission(Permission::ImagesManage) !== true) {
            throw new AuthorizationException;
        }
    }
}
