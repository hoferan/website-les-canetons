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
 * 404 not_found — see App\Exceptions\ApiError::notFound().
 *
 * WHAT THIS REPLACES, AND WHY IT MATTERED. Scramble's built-in described a 404
 * as Laravel's `{"message": "..."}` on `application/json`, and nineteen
 * operations referenced it. This API has not answered that shape since A2:
 * every failure is an RFC 9457 problem document on
 * `application/problem+json`. So the single most common failure in the whole
 * contract was described as a body that cannot occur, in a media type it is
 * never served as — and a client written from the document would branch on
 * `message`, read undefined, and show nothing.
 *
 * It also published an internal word. `#/components/responses/
 * ModelNotFoundException` puts "Model" in front of a reader with no ORM and no
 * reason to know Laravel has one. The component is `Problem404` now, matching
 * the ones App\Support\Scramble\DocumentsFailureModes registers.
 *
 * BOTH EXCEPTION TYPES, because the route table produces both. Route-model
 * binding throws ModelNotFoundException; a path no route matches raises
 * Symfony's NotFoundHttpException, and Laravel rewrites the first into the
 * second before rendering — see the renderer in bootstrap/app.php, which types
 * on the Symfony one for exactly that reason. Scramble reads the code
 * statically and sees whichever the analysis reaches first, so handling only
 * one is a coin toss.
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
