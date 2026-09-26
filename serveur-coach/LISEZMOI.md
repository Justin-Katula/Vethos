# Serveur du Coach Vethos

La clé DeepSeek vit **ici, et nulle part ailleurs** : ni dans l'app iPhone, ni dans l'app de bureau. Les apps ne connaissent qu'une adresse et un jeton d'installation anonyme que ce serveur délivre.

## Ce qu'il protège
- **La clé** : lue dans l'environnement, jamais renvoyée, jamais journalisée.
- **Le portefeuille** : 40 demandes par installation et par jour, 2000 en tout par jour, 5 nouveaux jetons par adresse et par heure (IPv6 regroupé par /64), 20 échecs d'authentification par adresse et par heure, jetons qui expirent après 30 jours (réglables). Un plafond mal écrit empêche le serveur de démarrer.
- **La conversation** : un tour « Coach » renvoyé par l'app n'est accepté que s'il porte la signature du serveur ; les faits sont une liste fermée par job.

Compromis assumé : derrière un opérateur mobile, beaucoup d'utilisateurs partagent une même adresse IPv4 publique ; le plafond par adresse (120/jour par défaut) peut alors gêner des utilisateurs légitimes à grande échelle. Relevez-le avec la croissance, ou passez à l'attestation d'appareil.

Pour aller plus loin contre l'abus (fabrication de jetons en masse) : exiger une attestation d'appareil Apple (App Attest) avant `/v1/install`.
- **Les règles du Coach** : le prompt système est construit sur le serveur. Une demande qui essaie d'en envoyer un est refusée.
- **La détresse** : détectée avant tout appel au modèle ; la réponse oriente vers une aide humaine.

## Variables d'environnement
| Variable | Obligatoire | Défaut |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | oui | — |
| `COACH_SECRET` | oui, 32 caractères au moins (signe les jetons) | — |
| `DEEPSEEK_MODEL` | non | `deepseek-chat` |
| `COACH_PAR_INSTALLATION_PAR_JOUR` | non | 40 |
| `COACH_GLOBAL_PAR_JOUR` | non | 2000 |
| `COACH_INSTALLATIONS_PAR_IP_PAR_HEURE` | non | 5 |
| `COACH_PAR_ADRESSE_PAR_JOUR` | non : appels par adresse et par jour, tous jetons confondus | 120 |
| `COACH_PROXYS` | non : nombre de proxys de confiance devant le serveur (l'adresse est lue à droite de `X-Forwarded-For`) | 0 |
| `COACH_JOURS_JETON` | non : durée de vie d'un jeton | 30 |
| `PORT` | non | 8787 |

Générer un secret : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Déployer
```bash
docker build -f serveur-coach/Dockerfile -t vethos-coach .
docker run -p 8787:8787 -e DEEPSEEK_API_KEY=... -e COACH_SECRET=... vethos-coach
```
N'importe quel hébergeur de conteneurs convient (Fly.io, Render, Railway…). Mettez-le derrière HTTPS.

## Brancher les apps
- **iPhone** : `extra.coachUrl` dans `mobile/app.json` (par ex. `https://coach.mondomaine.com`).
- **Bureau** : variable `VETHOS_COACH_URL` au lancement, ou `coachUrl` dans les réglages.

Tant qu'aucune adresse n'est configurée, le Coach n'apparaît nulle part : les apps retombent sur les phrases du moteur.

## Routes
- `GET /health`
- `POST /v1/install` → `{ token }`
- `POST /v1/coach` (en-tête `Authorization: Bearer <token>`) → `{ texte }` (ou `null` si la réponse du modèle a été écartée par les garde-fous)
