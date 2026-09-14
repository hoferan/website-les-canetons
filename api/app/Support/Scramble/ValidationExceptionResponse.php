<?php

namespace App\Support\Scramble;

use App\Exceptions\ApiError;
use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
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
            ->setDescription('The submitted fields were rejected. `errors` names each one and why.')
            ->setContent(
                ApiError::MEDIA_TYPE,
                Schema::fromType(ErrorResponseSchema::schema(['validation_failed'], withErrors: true))
            );
    }

    /**
     * Named for the STATUS, not for the exception class that happens to raise
     * it. `#/components/responses/AuthenticationException` published a PHP class
     * name to readers with no PHP, and it would become a lie the day the
     * renderer typed on a different exception. Matches the components
     * App\Support\Scramble\DocumentsFailureModes registers, so one failure has
     * one name whichever half of the machinery declared it.
     */
    public function reference(ObjectType $type)
    {
        return new Reference('responses', 'Problem400', $this->components);
    }
}
