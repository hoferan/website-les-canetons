<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PhotoResource;
use App\Models\SitePhoto;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;

#[Group('Public pages')]
class SitePhotoController extends Controller
{
    /**
     * The two single photographs of the site.
     *
     * Anonymous. `band` is the photo of the band, shown on the band page, and
     * `concert` the one that announces the next concert, shown on the home
     * page. Either is null while nothing is placed there, and the page then
     * shows its placeholder. Neither carries alt text: the page describes both by
     * the band's name.
     */
    #[Endpoint(operationId: 'sitePhoto.index')]
    #[Response(200, 'The band photo and the concert photo, each null when nothing is placed there.')]
    public function index(): JsonResponse
    {
        $photos = SitePhoto::query()->with('image')->get()->keyBy('slot');

        return response()->json([
            'band' => PhotoResource::of($photos->get('band')?->image),
            'concert' => PhotoResource::of($photos->get('concert')?->image),
        ]);
    }
}
