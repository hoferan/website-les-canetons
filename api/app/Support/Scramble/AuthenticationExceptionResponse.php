<?php

namespace App\Support\Scramble;

use App\Exceptions\ApiError;
use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
use Illuminate\Auth\AuthenticationException;

/** 401 not_authenticated; see App\Exceptions\ApiError::unauthenticated(). */
final class AuthenticationExceptionResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType && $type->isInstanceOf(AuthenticationException::class);
    }

    public function toResponse(Type $type)
    {
        return Response::make(401)
            ->setDescription('No session, or it has expired. Log in and retry.')
            ->setContent(ApiError::MEDIA_TYPE, Schema::fromType(ErrorResponseSchema::schema(['not_authenticated'])));
    }

    /**
     * Named for the status, not for the exception class that raises it: a PHP
     * class name means nothing to a reader without PHP, and would be wrong if
     * the renderer typed on a different exception. Matches the components
     * App\Support\Scramble\DocumentsFailureModes registers, so one failure has
     * one name whichever half of the machinery declared it.
     */
    public function reference(ObjectType $type)
    {
        return new Reference('responses', 'Problem401', $this->components);
    }
}
