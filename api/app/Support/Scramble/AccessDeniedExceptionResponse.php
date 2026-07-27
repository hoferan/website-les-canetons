<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * 403 access_denied — see App\Exceptions\ApiError::forbidden().
 *
 * Typed on Symfony's AccessDeniedHttpException, not Laravel's
 * AuthorizationException, mirroring the renderer in bootstrap/app.php: a thrown
 * AuthorizationException has been rewritten to this by the time it is rendered.
 *
 * Currently unreachable through Scramble's route inference: every real 403 in
 * this API comes from the custom `capability:*` route middleware throwing
 * AuthorizationException, and nothing in the code carries a `@throws` or
 * `authorize()` override Scramble can statically infer through a custom
 * middleware alias the way it special-cases `auth:sanctum` for 401. This is
 * not a bug in this class — it is not broken, just not yet exercised by any
 * documented route — and it will apply automatically the moment a route
 * exposes AccessDeniedHttpException in a way Scramble's static analysis can
 * see. Do not "fix" this by annotating routes just to force a 403 into the
 * document; the front end's mutator normalizes every non-2xx response into
 * one error type anyway, so per-route 403 documentation buys the generated
 * client almost nothing.
 * Tests\Feature\OpenApiDocumentTest::test_the_access_denied_extension_documents_403_directly
 * exercises toResponse() directly, so this class stays pinned even while it
 * cannot be reached through the exported document.
 */
final class AccessDeniedExceptionResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType && $type->isInstanceOf(AccessDeniedHttpException::class);
    }

    public function toResponse(Type $type)
    {
        return Response::make(403)
            ->setDescription('Access denied.')
            ->setContent('application/json', Schema::fromType(ErrorResponseSchema::schema(['access_denied'])));
    }

    public function reference(ObjectType $type)
    {
        return new Reference('responses', Str::start($type->name, '\\'), $this->components);
    }
}
