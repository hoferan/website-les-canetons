/**
 * The permissions /website needs, all of them together: GET /website/export
 * and POST /website/import each check the three, since an import replaces
 * what each of them guards (WebsiteController, ADR 0039).
 *
 * The route guard and the nav entry both read this, so a role holding only
 * some of them gets neither the entry nor a page whose actions answer 403.
 */
export const WEBSITE_PERMISSIONS = ["content.manage", "images.manage", "history.manage"] as const;
