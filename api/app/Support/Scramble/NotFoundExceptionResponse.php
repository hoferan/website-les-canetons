<?php

namespace App\Support\Scramble;

use App\Exceptions\ApiError;
use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * 404 not_found; see App\Exceptions\ApiError::notFound().
 *
 * Replaces Scramble's built-in, which describes a 404 as Laravel's
 * `{"message": "..."}` on `application/json`. This API never answers that
 * shape (ADR 0012): every failure is an RFC 9457 problem document on
 * `application/problem+json`, and a client written from the built-in would
 * branch on `message` and read undefined. The component is `Problem404`,
 * matching the ones App\Support\Scramble\DocumentsFailureModes registers,
 * instead of `ModelNotFoundException`, an internal word a reader has no reason
 * to know.
 *
 * Both exception types, because the route table produces both. Route-model
 * binding throws ModelNotFoundException; a path no route matches raises
 * Symfony's NotFoundHttpException, and Laravel rewrites the first into the
 * second before rendering (see the renderer in bootstrap/app.php, which types
 * on the Symfony one for that reason). Scramble reads the code statically and
 * sees whichever the analysis reaches first, so handling only one is a coin
 * toss.
 */
final class NotFoundExceptionResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType
            && ($type->isInstanceOf(ModelNotFoundException::class) || $type->isInstanceOf(NotFoundHttpException::class));
    }

    public function toResponse(Type $type)
    {
        return Response::make(404)
            ->setDescription('No such record.')
            ->setContent(ApiError::MEDIA_TYPE, Schema::fromType(ErrorResponseSchema::schema(['not_found'])));
    }

    public function reference(ObjectType $type)
    {
        return new Reference('responses', 'Problem404', $this->components);
    }
}
