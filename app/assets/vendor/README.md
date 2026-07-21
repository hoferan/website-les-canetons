# Vendored third-party assets

Precompiled, shipped as-is (no CSS/JS build pipeline). Do not hand-edit.

## bulma.min.css

- Library: Bulma (pure-CSS framework)
- Version: 1.0.4
- Source: https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css
- Used by: `app/assets/css/signups_admin.css` (admin overview only)

### Refresh

    curl -fL https://cdn.jsdelivr.net/npm/bulma@<version>/css/bulma.min.css \
      -o app/assets/vendor/bulma.min.css

## i18next.min.js

- Library: i18next (i18n framework)
- Version: 23.11.5
- Source: https://cdn.jsdelivr.net/npm/i18next@23.11.5/dist/umd/i18next.min.js
- Used by: `app/assets/js/i18n.js` (French translation of API error responses)

### Refresh

    curl -fL https://cdn.jsdelivr.net/npm/i18next@<version>/dist/umd/i18next.min.js \
      -o app/assets/vendor/i18next.min.js
