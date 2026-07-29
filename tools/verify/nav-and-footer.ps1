$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8100'

$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail = '') {
    $results.Add([pscustomobject]@{ Check = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
}
function Get-Html($path) { Invoke-WebRequest -Uri "$base$path" -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 30 }

# --- header navigation is per-tree -------------------------------------------
$fr = Get-Html '/fr/accueil/'
Check 'FR page shows FR menu items'    ($fr.Content -match 'Historique' -and $fr.Content -match 'Moniteurs' -and $fr.Content -match 'Sponsors')
Check 'FR page shows NO DE menu items' ($fr.Content -notmatch 'Geschichte' -and $fr.Content -notmatch 'Anfänge' -and $fr.Content -notmatch 'Sponsoren')

$de = Get-Html '/de/aktuell/'
Check 'DE page shows DE menu items'    ($de.Content -match 'Geschichte' -and $de.Content -match 'Anfänge' -and $de.Content -match 'Sponsoren')
Check 'DE page shows NO FR menu items' ($de.Content -notmatch 'Historique' -and $de.Content -notmatch 'Moniteurs')

# deeper pages in each tree, not just the landing page
$frDeep = Get-Html '/fr/sponsors/'
Check 'FR deep page keeps FR menu' ($frDeep.Content -match 'Historique' -and $frDeep.Content -notmatch 'Geschichte')
$deDeep = Get-Html '/de/sponsoren/'
Check 'DE deep page keeps DE menu' ($deDeep.Content -match 'Geschichte' -and $deDeep.Content -notmatch 'Historique')

# --- footer replaced ---------------------------------------------------------
# Assert on the <footer> element itself. Page-wide string absence is useless
# here: PowerShell's -notmatch is case-INSENSITIVE, so 'Themes' matches
# /wp-content/themes/ in every asset URL and 'Patterns' matches the parent
# theme's inlined style.css header.
$footer = [regex]::Match($fr.Content, '(?s)<footer.*?</footer>').Value
Check 'footer: element found'          ($footer.Length -gt 0)
Check 'footer: copyright present'      ($footer -match 'Guggenmusik Les Canetons de Fribourg')
Check 'footer: switcher present'       ($footer -match 'canetons-lang-switcher')
Check 'footer: site title present'     ($footer -match 'wp-block-site-title')
Check 'footer: no WordPress credit'    ($footer -cnotmatch 'Designed with')
foreach ($dead in @('FAQs', 'Authors', 'Shop', 'Blog', 'Events')) {
    Check "footer: dead link '$dead' gone" ($footer -cnotmatch $dead)
}
Check 'footer: no href="#" placeholders' ($footer -notmatch 'href="#"')
Check 'footer: no TT5 nav block'        ($footer -notmatch 'wp-block-navigation')

# --- nothing from the earlier pass regressed --------------------------------
foreach ($p in @(@{u='/fr/accueil/'; t='fr-CH'}, @{u='/de/aktuell/'; t='de-CH'})) {
    $r = Get-Html $p.u
    $m = [regex]::Match($r.Content, 'lang="([^"]+)"')
    Check "still lang=$($p.t) on $($p.u)" ($m.Groups[1].Value -eq $p.t) "got $($m.Groups[1].Value)"
}
Check 'switcher still cross-links' ($fr.Content -match '/de/aktuell/' -and $de.Content -match '/fr/accueil/')
# Was asserting is-style-canetons-card, which the pattern reshape deliberately
# removed — the real pages are heading/photo/list, not card grids. Assert the
# shape that actually exists, or this check silently contradicts verify-patterns.ps1.
$pat = Get-Html '/fr/comite-teamdirection/'
Check 'patterns still render' ($pat.Content -match 'Le comité' -and $pat.Content -match 'wp-block-image' -and $pat.Content -notmatch 'is-style-canetons-card')

$paths = @('/fr/accueil/','/fr/canetons/','/fr/historique/','/fr/commencement/','/fr/moniteurs/',
           '/fr/comite-teamdirection/','/fr/cd/','/fr/multimedia/','/fr/sponsors/',
           '/de/aktuell/','/de/canetons/','/de/geschichte/','/de/anfaenge/','/de/leiter/',
           '/de/komitee-teamdirection/','/de/cd/','/de/multimedia/','/de/sponsoren/')
$bad = @()
foreach ($p in $paths) { $r = Get-Html $p; if ($r.StatusCode -ne 200) { $bad += "$p=$($r.StatusCode)" } }
Check 'all 18 pages still 200' ($bad.Count -eq 0) $($bad -join ' ')

$results | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
Write-Output "TOTAL=$($results.Count) FAILED=$(($results | Where-Object Result -eq 'FAIL').Count)"
