<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\OperationExtension;
use Dedoc\Scramble\Support\Generator\Operation;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Generator\Types\StringType;
use Dedoc\Scramble\Support\RouteInfo;

/**
 * Removes three things the document would say about a response because PHP
 * said them to a browser, not because a contract should.
 *
 * Scramble reads a controller's Response object, which is built to be sent
 * rather than described, so transport detail leaks through with the content.
 * `GET /events/{event}/registrations.{format}`, the one endpoint here that
 * returns a file, shows all three.
 *
 * 1. Hop-by-hop headers. `Transfer-Encoding: chunked` is negotiated between
 *    one client and one server on one connection (RFC 9110 §7.6.1). A proxy
 *    may change it, so a contract cannot promise it.
 *
 * 2. A charset on a media type. `text/csv; charset=UTF-8` is a correct
 *    Content-Type and a poor key: OpenAPI matches content by media type, and
 *    the parameter stops the entry matching `text/csv`. Every response is
 *    UTF-8, and the reference says so once.
 *
 * 3. A file that claims to be text. Left alone, an XLSX body is
 *    `{"type":"string"}`, like the Markdown one beside it. `format: binary`
 *    tells a generated client to keep the bytes rather than decode them. A
 *    string body under a media type that is neither JSON nor text/* is a file.
 *
 * Derived rather than annotated, so the next endpoint that streams something
 * gets all three.
 */
class TidiesResponseMedia extends OperationExtension
{
    /**
     * Headers that describe this connection rather than this API.
     *
     * RFC 9110 §7.6.1's list, in full: the reason covers every entry, though
     * only `Transfer-Encoding` occurs in practice.
     */
    private const HOP_BY_HOP = [
        'transfer-encoding', 'connection', 'keep-alive', 'upgrade',
        'te', 'trailer', 'proxy-authenticate', 'proxy-authorization',
    ];

    public function handle(Operation $operation, RouteInfo $routeInfo): void
    {
        foreach ($operation->responses ?? [] as $response) {
            if (! $response instanceof Response) {
                continue;
            }

            $this->dropHopByHopHeaders($response);
            $response->content = $this->tidyContent($response->content);
        }
    }

    private function dropHopByHopHeaders(Response $response): void
    {
        foreach (array_keys($response->headers) as $name) {
            if (in_array(strtolower((string) $name), self::HOP_BY_HOP, true)) {
                unset($response->headers[$name]);
            }
        }
    }

    /**
     * @param  array<string, Schema|Reference>  $content
     * @return array<string, Schema|Reference>
     */
    private function tidyContent(array $content): array
    {
        $tidied = [];

        foreach ($content as $mediaType => $schema) {
            // Everything after the first `;` is a parameter (charset, boundary,
            // profile). The bare type is the key OpenAPI matches on.
            $bare = trim(explode(';', (string) $mediaType)[0]);

            // First entry wins if stripping the parameter collides with one
            // already present. Two entries differing only by charset describe
            // the same body, so either is right.
            if (array_key_exists($bare, $tidied)) {
                continue;
            }

            if ($schema instanceof Schema && $this->isFile($bare) && $schema->type instanceof StringType) {
                $schema->type->format('binary');
            }

            $tidied[$bare] = $schema;
        }

        return $tidied;
    }

    private function isFile(string $mediaType): bool
    {
        return ! str_starts_with($mediaType, 'text/')
            && ! str_contains($mediaType, 'json');
    }
}
