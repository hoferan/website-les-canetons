<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Support\Str;

/** 401 not_authenticated — see App\Exceptions\ApiError::unauthenticated(). */
final class AuthenticationExceptionResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType && $type->isInstanceOf(AuthenticationException::class);
    }

    public function toResponse(Type $type)
    {
        return Response::make(401)
            ->setDescription('Not authenticated.')
            ->setContent('application/json', Schema::fromType(ErrorResponseSchema::schema(['not_authenticated'])));
    }

    public function reference(ObjectType $type)
    {
        return new Reference('responses', Str::start($type->name, '\\'), $this->components);
    }
}
