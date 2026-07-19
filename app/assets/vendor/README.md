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
