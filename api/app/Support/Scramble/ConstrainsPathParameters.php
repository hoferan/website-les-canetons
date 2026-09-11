<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\OperationExtension;
use Dedoc\Scramble\Support\Generator\Operation;
use Dedoc\Scramble\Support\Generator\Parameter;
use Dedoc\Scramble\Support\RouteInfo;

/**
 * Publishes the constraints a route already puts on its own path parameters.
 *
 * WHY THIS EXISTS. `GET /events/{event}/registrations.{format}` is declared
 * `->where('format', 'xlsx|csv|md|json')`, so the router itself answers 404 to
 * anything else — the constraint is real, enforced before any code runs, and a
 * documentation review on 2026-09-11 found that the contract published `format`
 * as an unconstrained `string`. A generated client therefore let you ask for
 * `pdf` and compile.
 *
 * WHY IT IS DERIVED RATHER THAN ANNOTATED. The alternative was
 * `#[PathParameter('format', type: "'xlsx'|'csv'|'md'|'json'")]`, which works
 * and puts the accepted set in the document — twice. Two lists in two files
 * agreeing today is one edit away from disagreeing, and the one in the document
 * is the copy nobody runs. Reading `$route->wheres` means the route stays the
 * only place a format is named.
 *
 * WHAT IT DOES WITH A PATTERN THAT IS NOT A LIST. Anything other than a plain
 * alternation of literal tokens becomes `pattern` rather than `enum` — still
 * true, still machine-readable, and it keeps this extension from having to
 * understand regular expressions to stay correct. Laravel's own numeric
 * constraints are skipped entirely: Scramble has already typed those parameters
 * as integers from route-model binding, and republishing `[0-9]+` as a string
 * pattern over the top would make the document worse.
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
