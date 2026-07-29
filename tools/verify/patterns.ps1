$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8100'

$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail = '') {
    $results.Add([pscustomobject]@{ Check = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
}
function Body($path) {
    $r = Invoke-WebRequest -Uri "$base$path" -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 30
    return @{ Status = $r.StatusCode; Html = $r.Content }
}

# --- sponsors: three link lists, no logo cards -------------------------------
$sp = Body '/fr/sponsors/'
Check 'sponsors: 200'                ($sp.Status -eq 200) "status $($sp.Status)"
Check 'sponsors: Les Carnavals'      ($sp.Html -cmatch 'Les Carnavals')
Check 'sponsors: Les Guggens'        ($sp.Html -cmatch 'Les Guggens')
Check 'sponsors: Les Amis'           ($sp.Html -cmatch 'Les Amis')
Check 'sponsors: is a list'          (([regex]::Matches($sp.Html, '<li>')).Count -ge 12) "li count $((([regex]::Matches($sp.Html,'<li>')).Count))"
Check 'sponsors: no logo cards left' ($sp.Html -notmatch 'is-style-canetons-card')
# The German page now carries German headings — it used to reuse the French
# pattern verbatim, which is what this check was originally written against.
$spDe = Body '/de/sponsoren/'
Check 'sponsors de: German headings'  ($spDe.Status -eq 200 -and $spDe.Html -cmatch 'Die Fasnachten' -and $spDe.Html -cmatch 'Die Guggen') "status $($spDe.Status)"
Check 'sponsors de: same 12 links'    (([regex]::Matches($spDe.Html, 'href="http://www\.')).Count -ge 12) "links=$((([regex]::Matches($spDe.Html,'href="http://www\.')).Count))"

# --- comite: three photo+list sections ---------------------------------------
$co = Body '/fr/comite-teamdirection/'
Check 'comite: 200'                  ($co.Status -eq 200) "status $($co.Status)"
Check 'comite: Le comite section'    ($co.Html -cmatch 'Le comité')
Check 'comite: Direction musicale'   ($co.Html -cmatch 'Direction musicale')
Check 'comite: parrain et marraine'  ($co.Html -cmatch 'parrain et la marraine')
Check 'comite: has role list'        ($co.Html -cmatch 'Responsable Team Direction')
Check 'comite: contact TODO flagged' ($co.Html -cmatch 'formulaire de contact')
Check 'comite: no card grid left'    ($co.Html -notmatch 'is-style-canetons-card')

# --- canetons: eight photo+names sections ------------------------------------
$ca = Body '/fr/canetons/'
Check 'canetons: 200'                ($ca.Status -eq 200) "status $($ca.Status)"
foreach ($s in @('Nos Canetons','La Direction Musicale','Nos Batteurs','Nos Grosses-Caisses','Notre Lyre','Nos Cloches','Nos Trompettes','Nos Trombones')) {
    Check "canetons: $s" ($ca.Html -cmatch [regex]::Escape($s))
}
Check 'canetons: no card grid left'  ($ca.Html -notmatch 'is-style-canetons-card')

# --- empty image blocks must not break the markup ----------------------------
# These used to assert 'wp-block-image' was present, which passed on a STYLESHEET
# reference: an unset core/image block emits no <figure> and no <img> at all. The
# real property is that it emits nothing broken. Slot counts live in
# verify-photo-slots.sh, against the stored content.
Check 'images: no empty src emitted'  ($ca.Html -notmatch '<img[^>]*src=""')
Check 'images: no PHP notice leaked'  ($ca.Html -notmatch 'Warning|Notice|Fatal error')
Check 'comite: no empty src emitted'  ($co.Html -notmatch '<img[^>]*src=""')

# --- nothing else regressed --------------------------------------------------
$fr = Body '/fr/accueil/'
Check 'nav still per-tree'  ($fr.Html -cmatch 'Historique' -and $fr.Html -cnotmatch 'Geschichte')
Check 'hreflang still there' ($fr.Html -match 'rel="alternate" hreflang="de-CH"')
$footer = [regex]::Match($fr.Html, '(?s)<footer.*?</footer>').Value
Check 'footer still ours'   ($footer -match 'Guggenmusik Les Canetons de Fribourg' -and $footer -cnotmatch 'Designed with')

$paths = @('/fr/accueil/','/fr/canetons/','/fr/historique/','/fr/commencement/','/fr/moniteurs/',
           '/fr/comite-teamdirection/','/fr/cd/','/fr/multimedia/','/fr/sponsors/',
           '/de/aktuell/','/de/canetons/','/de/geschichte/','/de/anfaenge/','/de/leiter/',
           '/de/komitee-teamdirection/','/de/cd/','/de/multimedia/','/de/sponsoren/')
$bad = @()
foreach ($p in $paths) { $r = Body $p; if ($r.Status -ne 200) { $bad += "$p=$($r.Status)" } }
Check 'all 18 pages 200' ($bad.Count -eq 0) $($bad -join ' ')

$results | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
Write-Output "TOTAL=$($results.Count) FAILED=$(($results | Where-Object Result -eq 'FAIL').Count)"
