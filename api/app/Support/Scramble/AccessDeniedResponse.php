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
 */
final class AccessDeniedResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType && $type->isInstanceOf(AccessDeniedHttpException::class);
    }

    public function toResponse(Type $type)
    {
        return Response::make(403)
            ->setDescription('Access denied.')
            ->setContent('application/json', Schema::fromType(ErrorResponse::schema(['access_denied'])));
    }

    public function reference(ObjectType $type)
    {
        return new Reference('responses', Str::start($type->name, '\\'), $this->components);
    }
}
