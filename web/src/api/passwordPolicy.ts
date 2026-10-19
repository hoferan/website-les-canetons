/**
 * The shortest new password the API accepts.
 *
 * The rule is AccountPasswordRequest's `min:8`, whose comment says why eight.
 * The SPA states it before the first submit, and the generated client carries
 * it only as a doc comment. passwordPolicy.test.ts reads the committed
 * openapi.json, so changing it in Laravel fails the web suite until this
 * agrees.
 */
export const MIN_PASSWORD_LENGTH = 8;
