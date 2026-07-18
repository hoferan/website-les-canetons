<?php

use App\Env;

// Corner ribbon marking non-production environments (dev / test / qa) so it is
// always obvious you are not on the live site. Renders nothing on prod.
if (Env::isProd()) {
    return;
}
?>
<div class="env-ribbon env-ribbon-<?= htmlspecialchars(Env::current()) ?>" aria-hidden="true">
  <?= htmlspecialchars((string) Env::ribbonLabel()) ?>
</div>
