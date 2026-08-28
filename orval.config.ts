import { defineConfig } from "orval";

/**
 * Generates the API client and TanStack Query hooks from the committed OpenAPI
 * document. Everything under web/src/api/generated/ is GENERATED — never edit it
 * by hand; change the Laravel controller, run `npm run openapi` and `npm run
 * generate:api`, and commit the result. CI enforces this (see ci.yml).
 *
 * Every request goes through the mutator in web/src/api/http.ts, which owns the
 * cookie credentials, the Sanctum CSRF priming and the {error, code, fields}
 * error contract.
 */
export default defineConfig({
  canetons: {
    input: "api/openapi.json",
    output: {
      target: "web/src/api/generated/endpoints.ts",
      schemas: "web/src/api/generated/model",
      // split, so the MSW handlers land in endpoints.msw.ts instead of inside
      // endpoints.ts. In single mode they share the file, which puts
      // `import { http } from "msw"` at the top of the module the whole
      // application imports — relying on tree-shaking to keep a development-only
      // mocking library out of the production bundle. Splitting makes it
      // structural instead of hopeful.
      mode: "split",
      client: "react-query",
      httpClient: "fetch",
      clean: true,
      formatter: "prettier",
      // MSW handlers, generated from the same document as the client, so the
      // mocked backend cannot describe a contract the API does not have. They
      // are the FALLBACK layer: web/src/mocks/handlers.ts puts hand-written
      // handlers in front of them for the four endpoints where the content, not
      // just the shape, has to be plausible.
      // orval 8.23 takes a `generators` array here, not a bare `type`.
      mock: { generators: [{ type: "msw" }] },
      override: {
        mutator: {
          path: "web/src/api/http.ts",
          name: "customFetch",
        },
      },
    },
  },
});
