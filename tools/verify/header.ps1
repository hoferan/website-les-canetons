$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8100'

$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail = '') {
    $results.Add([pscustomobject]@{ Check = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
}
function Get-Html($p) { Invoke-WebRequest -Uri "$base$p" -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 30 }

$fr = Get-Html '/fr/accueil/'
$de = Get-Html '/de/aktuell/'

# The header element, isolated — page-wide checks would match the footer switcher.
$frHeader = [regex]::Match($fr.Content, '(?s)<header.*?</header>').Value
$deHeader = [regex]::Match($de.Content, '(?s)<header.*?</header>').Value

Check 'header element found'           ($frHeader.Length -gt 0)
Check 'header: site title'             ($frHeader -match 'wp-block-site-title')
Check 'header: switcher present'       ($frHeader -match 'canetons-lang-switcher')
Check 'header: navigation present'     ($frHeader -match 'wp-block-navigation')
Check 'header: FR menu on FR page'     ($frHeader -match 'Historique' -and $frHeader -notmatch 'Geschichte')
Check 'header: DE menu on DE page'     ($deHeader -match 'Geschichte' -and $deHeader -notmatch 'Historique')
Check 'header: FR marked current'      ($frHeader -match 'is-current[^>]*>\s*FR|aria-current="true">FR')
Check 'header: links to DE twin'       ($frHeader -match '/de/aktuell/')
Check 'header: agenda is second'       ([regex]::Match($frHeader, 'Accueil.*?Agenda').Success)
Check 'no PHP notice'                  ($fr.Content -notmatch 'Warning:|Notice:|Fatal error')

# The footer switcher must survive too — two switchers is intentional for now.
$frFooter = [regex]::Match($fr.Content, '(?s)<footer.*?</footer>').Value
Check 'footer switcher still there'    ($frFooter -match 'canetons-lang-switcher')
Check 'footer copyright still there'   ($frFooter -match 'Guggenmusik Les Canetons de Fribourg')

$paths = @('/fr/','/fr/accueil/','/fr/agenda/','/fr/sponsors/','/de/','/de/aktuell/','/de/termine/','/de/sponsoren/')
$bad = @(); foreach ($p in $paths) { $r = Get-Html $p; if ($r.StatusCode -ne 200) { $bad += "$p=$($r.StatusCode)" } }
Check 'key pages still 200' ($bad.Count -eq 0) $($bad -join ' ')

$results | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
Write-Output "TOTAL=$($results.Count) FAILED=$(($results | Where-Object Result -eq 'FAIL').Count)"
