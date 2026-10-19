<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\OperationExtension;
use Dedoc\Scramble\Support\Generator\Operation;
use Dedoc\Scramble\Support\Generator\Parameter;
use Dedoc\Scramble\Support\RouteInfo;

/**
 * Publishes the constraints a route already puts on its own path parameters.
 *
 * `GET /events/{event}/registrations.{format}` is declared
 * `->where('format', 'xlsx|csv|md|json')`, so the router answers 404 to
 * anything else before any code runs. Without this the contract publishes
 * `format` as an unconstrained `string`, and a generated client compiles a
 * request for `pdf`.
 *
 * Read from `$route->wheres` rather than annotated with `#[PathParameter]`,
 * so the route stays the only place a format is named. A second list in the
 * document would be a copy nobody runs.
 *
 * Anything other than a plain alternation of literal tokens becomes `pattern`
 * rather than `enum`, which stays correct without this extension having to
 * understand regular expressions. Laravel's numeric constraints are skipped:
 * Scramble has already typed those parameters as integers from route-model
 * binding, and a `[0-9]+` string pattern over the top would make the document
 * worse.
 */
class ConstrainsPathParameters extends OperationExtension
{
    /**
     * Patterns that say nothing a typed parameter does not already say.
     *
     * `[0-9]+` is what Route::whereNumber() writes, and every bound model
     * parameter here is already documented as an integer.
     */
    private const REDUNDANT = ['[0-9]+', '[0-9]*'];

    public function handle(Operation $operation, RouteInfo $routeInfo): void
    {
        foreach ($routeInfo->route->wheres as $name => $pattern) {
            if (in_array($pattern, self::REDUNDANT, true)) {
                continue;
            }

            $parameter = $this->pathParameter($operation, $name);

            if (! $parameter instanceof Parameter || $parameter->schema === null) {
                continue;
            }

            // Laravel compiles its own anchors onto every constraint, so a
            // hand-written ^…$ is the same thing said twice and only makes the
            // published regex harder to read.
            $constraint = trim($pattern, '^$');
            $alternatives = $this->alternation($constraint);

            if ($alternatives !== null) {
                $parameter->schema->type->enum($alternatives);

                continue;
            }

            $parameter->schema->type->pattern($constraint);
        }
    }

    private function pathParameter(Operation $operation, string $name): ?Parameter
    {
        foreach ($operation->parameters as $parameter) {
            if ($parameter instanceof Parameter && $parameter->in === 'path' && $parameter->name === $name) {
                return $parameter;
            }
        }

        return null;
    }

    /**
     * The accepted values, when the constraint is a plain list of them.
     *
     * Null for anything carrying regular-expression syntax, which is the signal
     * to publish the pattern verbatim instead of guessing at its meaning.
     *
     * @return list<string>|null
     */
    private function alternation(string $constraint): ?array
    {
        if (! preg_match('/^[A-Za-z0-9_.-]+(\|[A-Za-z0-9_.-]+)+$/', $constraint)) {
            return null;
        }

        return explode('|', $constraint);
    }
}
