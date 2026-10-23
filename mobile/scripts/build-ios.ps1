# Build iOS de production, envoyé tout seul à TestFlight.
# L'Apple ID se demande ici, en e-mail : sans lui, EAS propose le nom de
# l'équipe (« OBEDI KATULA JUSTIN (…) ») comme identifiant et la connexion échoue.
# Le mot de passe et le code à 6 chiffres se tapent ensuite, dans ce terminal.
$email = Read-Host 'Apple ID (e-mail)'
if (-not $email) { Write-Host 'Il faut l''e-mail du compte Apple.'; exit 1 }
$env:EXPO_APPLE_ID = $email.Trim()
$env:EXPO_NO_CAPABILITY_SYNC = '1'
npx eas-cli build --profile production --platform ios --auto-submit
