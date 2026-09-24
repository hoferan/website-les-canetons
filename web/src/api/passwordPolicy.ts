/**
 * The shortest new password the API accepts (#101).
 *
 * The rule itself is AccountPasswordRequest's `min:8`, and the comment there
 * says why it is eight and not twelve. The SPA states the rule before the
 * first submit, so it needs the number up front, and the generated client
 * carries it only as a doc comment. passwordPolicy.test.ts
 * reads the committed openapi.json, so raising it in Laravel fails the web
 * suite until this agrees.
 */
export const MIN_PASSWORD_LENGTH = 8;
