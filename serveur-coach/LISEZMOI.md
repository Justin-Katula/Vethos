# Serveur du Coach Vethos

La clé DeepSeek vit **ici, et nulle part ailleurs** : ni dans l'app iPhone, ni dans l'app de bureau. Les apps ne connaissent qu'une adresse et un jeton d'installation anonyme que ce serveur délivre.

## Ce qu'il protège
- **La clé** : lue dans l'environnement, jamais renvoyée, jamais journalisée.
- **Le portefeuille** : 40 demandes par installation et par jour, 2000 en tout par jour, 5 nouveaux jetons par IP et par heure (réglables).
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
| `COACH_DERRIERE_PROXY` | non (mettre `1` derrière un proxy qui pose `X-Forwarded-For`) | — |
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
