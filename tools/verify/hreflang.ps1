$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8100'

$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail = '') {
    $results.Add([pscustomobject]@{ Check = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
}
function Alternates($path) {
    $r = Invoke-WebRequest -Uri "$base$path" -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 30
    $out = @{}
    foreach ($m in [regex]::Matches($r.Content, '<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"')) {
        $out[$m.Groups[1].Value] = $m.Groups[2].Value
    }
    return $out
}

# A French page: self fr-CH, twin de-CH, x-default on the French URL.
$fr = Alternates '/fr/accueil/'
Check 'fr page: 3 alternates'      ($fr.Count -eq 3) "got $($fr.Count): $($fr.Keys -join ',')"
Check 'fr page: self-referential'  ($fr['fr-CH'] -match '/fr/accueil/$') $fr['fr-CH']
Check 'fr page: twin is de'        ($fr['de-CH'] -match '/de/aktuell/$') $fr['de-CH']
Check 'fr page: x-default is fr'   ($fr['x-default'] -match '/fr/accueil/$') $fr['x-default']

# The German twin must mirror it exactly, or search engines discard the pair.
$de = Alternates '/de/aktuell/'
Check 'de page: 3 alternates'      ($de.Count -eq 3) "got $($de.Count)"
Check 'de page: self-referential'  ($de['de-CH'] -match '/de/aktuell/$') $de['de-CH']
Check 'de page: twin is fr'        ($de['fr-CH'] -match '/fr/accueil/$') $de['fr-CH']
Check 'de page: x-default is fr'   ($de['x-default'] -match '/fr/accueil/$') $de['x-default']
Check 'pair is reciprocal'         ($fr['fr-CH'] -eq $de['fr-CH'] -and $fr['de-CH'] -eq $de['de-CH'])

# A deeper twin pair, to prove it is not hardcoded to the landing pages.
$sp = Alternates '/fr/sponsors/'
Check 'deep page: twin is sponsoren' ($sp['de-CH'] -match '/de/sponsoren/$') $sp['de-CH']

# The tree roots carry them too.
$root = Alternates '/fr/'
Check 'tree root: has alternates'  ($root.Count -eq 3) "got $($root.Count)"

# A page OUTSIDE both trees must advertise nothing — it has no counterpart.
$priv = Invoke-WebRequest -Uri "$base/?page_id=3" -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 30
Check 'non-tree page: no alternates' ($priv.Content -notmatch 'rel="alternate" hreflang')

# Language attributes must be unchanged by the refactor of canetons_current_language().
foreach ($p in @(@{u='/fr/accueil/'; t='fr-CH'}, @{u='/de/aktuell/'; t='de-CH'}, @{u='/fr/'; t='fr-CH'}, @{u='/de/'; t='de-CH'})) {
    $r = Invoke-WebRequest -Uri "$base$($p.u)" -UseBasicParsing -TimeoutSec 30
    $m = [regex]::Match($r.Content, 'lang="([^"]+)"')
    Check "lang unchanged $($p.u)" ($m.Groups[1].Value -eq $p.t) "got $($m.Groups[1].Value)"
}

# And the per-tree navigation must still be right.
$frPage = Invoke-WebRequest -Uri "$base/fr/accueil/" -UseBasicParsing -TimeoutSec 30
$dePage = Invoke-WebRequest -Uri "$base/de/aktuell/" -UseBasicParsing -TimeoutSec 30
Check 'nav still per-tree' ($frPage.Content -match 'Historique' -and $frPage.Content -notmatch 'Geschichte' -and $dePage.Content -match 'Geschichte')

$results | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
Write-Output "TOTAL=$($results.Count) FAILED=$(($results | Where-Object Result -eq 'FAIL').Count)"
