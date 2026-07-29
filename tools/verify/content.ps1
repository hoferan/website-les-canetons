$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8100'

$results = [System.Collections.Generic.List[object]]::new()
function Check($name, $ok, $detail = '') {
    $results.Add([pscustomobject]@{ Check = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }); Detail = $detail })
}
function Get-Html($p) { Invoke-WebRequest -Uri "$base$p" -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 30 }

# --- real French copy actually landed ---------------------------------------
$hist = Get-Html '/fr/historique/'
Check 'historique: Jacky Schaller'     ($hist.Content -match 'Jacky Schaller')
Check 'historique: 2002 founding'      ($hist.Content -match 'octobre 2002')
Check 'historique: succession named'   ($hist.Content -match 'Lilou Keller' -and $hist.Content -match 'Ana.s Meuwly')
Check 'historique: no TODO left'       ($hist.Content -notmatch 'TODO')

$can = Get-Html '/fr/canetons/'
Check 'canetons: real member names'    ($can.Content -match 'Abiga.lle' -and $can.Content -match 'Marc-J.r.me')
Check 'canetons: positional wording'   ($can.Content -match 'De gauche . droite')
# Photo slots are NOT checked here. An unset core/image block renders no <figure>
# and no <img>, so any front-end assertion about them matches a stylesheet string
# and passes vacuously — verify-photo-slots.sh asserts them in the stored content,
# which is where they matter (the editor).
Check 'canetons: no broken img tags'   ($can.Content -notmatch '<img[^>]*src=""')

$mon = Get-Html '/fr/moniteurs/'
Check 'moniteurs: MERCI + names'       ($mon.Content -match 'MERCI' -and $mon.Content -match 'Jessaline')

$com = Get-Html '/fr/comite-teamdirection/'
Check 'comite: real committee names'   ($com.Content -match 'Delphine Maillard' -and $com.Content -match 'Patrice Bersier')
Check 'comite: parrain + marraine'     ($com.Content -match 'Richard Hertig' -and $com.Content -match 'Annick B.rgisser')
Check 'comite: contact detail flagged' ($com.Content -match 'TODO')

$cd = Get-Html '/fr/cd/'
Check 'cd: price and formats'          ($cd.Content -match '20\.' -and $cd.Content -match 'cl. USB')
Check 'cd: order address'              ($cd.Content -match 'comite@lescanetons\.org')

$sp = Get-Html '/fr/sponsors/'
Check 'sponsors: real URLs'            ($sp.Content -match 'carnavaldesbolzes\.ch' -and $sp.Content -match '13carnavaleux\.com')
Check 'sponsors: 12 links'             (([regex]::Matches($sp.Content, 'href="http://www\.')).Count -ge 12) "links=$((([regex]::Matches($sp.Content,'href="http://www\.')).Count))"

$mm = Get-Html '/fr/multimedia/'
Check 'multimedia: France 3 link'      ($mm.Content -match 'france3-regions\.francetvinfo\.fr')

# --- German drafts -----------------------------------------------------------
$geschichte = Get-Html '/de/geschichte/'
Check 'geschichte: German prose'       ($geschichte.Content -match 'Kinderguggen' -and $geschichte.Content -match 'Oktober 2002')
Check 'geschichte: no French leak'     ($geschichte.Content -notmatch 'guggen d.enfants')
$deCan = Get-Html '/de/canetons/'
Check 'de canetons: German headings'   ($deCan.Content -match 'Unsere Trompeten' -and $deCan.Content -match 'Von links nach rechts')

# --- contact page + form ----------------------------------------------------
$contact = Get-Html '/fr/contact/'
Check 'contact fr: 200'                ($contact.StatusCode -eq 200) "status $($contact.StatusCode)"
Check 'contact fr: form rendered'      ($contact.Content -match 'fluentform|ff-el-group|frm-fluent-form')
Check 'contact fr: French labels'      ($contact.Content -match 'Adresse e-mail' -and $contact.Content -match 'Message')
$kontakt = Get-Html '/de/kontakt/'
Check 'contact de: 200'                ($kontakt.StatusCode -eq 200) "status $($kontakt.StatusCode)"
Check 'contact de: form rendered'      ($kontakt.Content -match 'fluentform|ff-el-group|frm-fluent-form')

# --- login entry point in the header nav ------------------------------------
$fr = Get-Html '/fr/accueil/'
$frHeader = [regex]::Match($fr.Content, '(?s)<header.*?</header>').Value
Check 'header: Connexion link'         ($frHeader -match 'Connexion' -and $frHeader -match 'wp-login\.php')
Check 'header: Contact link'           ($frHeader -match '/fr/contact/')
$de = Get-Html '/de/aktuell/'
$deHeader = [regex]::Match($de.Content, '(?s)<header.*?</header>').Value
Check 'de header: Anmelden link'       ($deHeader -match 'Anmelden')
Check 'de header: Kontakt link'        ($deHeader -match '/de/kontakt/')

# --- nothing regressed -------------------------------------------------------
Check 'hreflang still emitted'         ($fr.Content -match 'rel="alternate" hreflang="de-CH"')
Check 'no PHP notice anywhere'         ($fr.Content -notmatch 'Warning:|Fatal error' -and $com.Content -notmatch 'Warning:|Fatal error')

$paths = @('/fr/','/fr/accueil/','/fr/agenda/','/fr/canetons/','/fr/historique/','/fr/commencement/','/fr/moniteurs/',
           '/fr/comite-teamdirection/','/fr/cd/','/fr/multimedia/','/fr/sponsors/','/fr/contact/',
           '/de/','/de/aktuell/','/de/termine/','/de/canetons/','/de/geschichte/','/de/anfaenge/','/de/leiter/',
           '/de/komitee-teamdirection/','/de/cd/','/de/multimedia/','/de/sponsoren/','/de/kontakt/')
$bad = @(); foreach ($p in $paths) { $r = Get-Html $p; if ($r.StatusCode -ne 200) { $bad += "$p=$($r.StatusCode)" } }
Check "all $($paths.Count) pages 200" ($bad.Count -eq 0) $($bad -join ' ')

$results | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
Write-Output "TOTAL=$($results.Count) FAILED=$(($results | Where-Object Result -eq 'FAIL').Count)"
