# P16 Phase 4.1 — Mini-spike ACL du named pipe

Date : 2026-05-18
Statut : décision d'implémentation Phase 4.1

## Constat

Le bridge Vethos écoute sur `\\.\pipe\VethosServiceBridge` via `net.createServer()`.
L'API Node `net` n'expose pas de paramètre permettant de passer un descripteur de
sécurité Windows (`SECURITY_ATTRIBUTES`) à `CreateNamedPipe`.

Conséquence : restreindre finement la DACL du pipe côté service exigerait une
couche native ou un remplacement du serveur pipe par une implémentation Win32
spécifique.

## Périmètre réel

Le chemin `\\.\pipe\...` cible le namespace local. L'exposition réseau directe
nécessiterait un accès au namespace pipe distant de la machine et reste gouvernée
par Windows/SMB/firewall. Dans l'état actuel, le protocole du service reste un
protocole local Vethos, mais il ne peut pas encore prouver l'identité du client au
niveau pipe.

## Décision

Pour Phase 4.1, on durcit immédiatement `C:\ProgramData\Vethos` par ACL, car c'est
réalisable sans dépendance native et protège les fichiers de blocage persistés.

On ne prétend pas durcir la DACL du named pipe avec `net`. Le durcissement pipe
reste un sujet de Phase 4 ultérieure : soit addon natif minimal autour de
`CreateNamedPipe`, soit migration du bridge vers une bibliothèque qui expose les
attributs de sécurité Windows.
