<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Replaces Scramble's built-in 422 {message, errors} with what
 * App\Exceptions\ApiError::validation() really returns: 400 validation_failed.
 */
final class ValidationExceptionResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType && $type->isInstanceOf(ValidationException::class);
    }

    public function toResponse(Type $type)
    {
        return Response::make(400)
            ->setDescription('Validation failed. See App\Exceptions\ApiError::validation().')
            ->setContent(
                'application/json',
                Schema::fromType(ErrorResponse::schema(['validation_failed'], withFields: true))
            );
    }

    public function reference(ObjectType $type)
    {
        return new Reference('responses', Str::start($type->name, '\\'), $this->components);
    }
}
