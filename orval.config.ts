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
      client: "react-query",
      httpClient: "fetch",
      clean: true,
      formatter: "prettier",
      override: {
        mutator: {
          path: "web/src/api/http.ts",
          name: "customFetch",
        },
      },
    },
  },
});
