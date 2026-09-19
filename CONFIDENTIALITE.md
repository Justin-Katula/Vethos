# Ce que Vethos fait de vos données

Document factuel, établi en lisant le code le 2026-09-18. Il décrit ce que
l'application fait réellement, pas ce qu'on aimerait qu'elle fasse. Il sert de base
à une politique de confidentialité ; **ce n'est pas un avis juridique**, et un
juriste doit le relire avant publication commerciale.

## En un mot

Vethos fonctionne **hors ligne**. Aucune donnée n'est envoyée nulle part, sauf une
seule exception décrite plus bas — et cette exception n'existe que si vous la
demandez vous-même.

## Ce qui est enregistré, et où

Tout vit dans un seul dossier sur votre machine :

```
C:\Users\<vous>\AppData\Roaming\Vethos\
```

| Donnée | Ce que c'est |
|---|---|
| Compte local | Nom, courriel, empreinte du mot de passe (PBKDF2, 180 000 itérations, salée) |
| Objectifs et tâches | Ce que vous écrivez |
| Emploi du temps | Vos créneaux, votre sommeil |
| Applications déclarées | Celles que vous choisissez de bloquer |
| Temps passé | Combien de minutes chaque application déclarée a tourné, par jour, **90 jours** |
| Réglages | Apparence, heures, et votre clé DeepSeek si vous en mettez une |

**Ces fichiers sont chiffrés au repos.** La clé est dérivée de votre compte Windows
et gardée par le système (DPAPI). Copiés sur une autre machine ou lus depuis un
autre compte, ils sont illisibles.

Ce que cela ne protège pas : un programme tournant déjà sous votre session Windows
peut demander au système de déchiffrer, comme Vethos le fait. La barrière vise la
copie de fichiers et l'accès hors session, pas un logiciel malveillant déjà
installé — aucun chiffrement local ne le pourrait.

## Ce qui n'est jamais enregistré

- Le contenu de ce que vous faites dans vos applications
- Vos frappes clavier, votre écran, votre micro, votre caméra
- Aucun identifiant publicitaire, aucune télémétrie, aucune analyse d'usage

## La seule chose qui sort de votre machine

**Uniquement si vous entrez une clé DeepSeek dans les réglages.** Sans clé — et
c'est l'état par défaut — rien ne sort, jamais.

Avec une clé, Vethos envoie à `api.deepseek.com` la liste des applications qu'il
n'a pas su classer tout seul : **nom du fichier exécutable, nom affiché, éditeur**.
Rien d'autre. Pas de chemins, pas d'identité, pas d'horaires, pas de contenu.

La réponse est mise en cache localement pour toujours : chaque application n'est
envoyée qu'une fois.

La clé est la vôtre et reste sur votre machine. Vethos n'en fournit aucune.

## Le blocage de sites (non activé à ce jour)

Le code sait bloquer des sites web, mais aucun écran ne permet encore d'en désigner,
et aucune session n'en transmet. Cette fonctionnalité est donc **inactive**.

Quand elle sera activée, elle lira les titres de fenêtres de vos navigateurs et, une
fois au démarrage, les domaines de votre historique de navigation — pour reconnaître
les sites, localement. Elle interrogera aussi la page d'accueil des domaines
rencontrés pour en lire le titre. Ce document devra être mis à jour à ce moment-là.

## Ce que l'application fait à votre système

- **Masque des fenêtres et coupe le son** des applications que vous bloquez. Aucun
  programme n'est jamais tué : vous ne perdez pas de travail non sauvegardé.
- **Coupe l'accès réseau** des applications bloquées, par une règle de pare-feu
  Windows. Cela demande une autorisation administrateur — une seule fois par
  lancement. Les règles portent le préfixe `Vethos-Net-Block-` et sont retirées à la
  fin de la session, ainsi qu'à la fermeture de l'application.
- **Ne touche jamais** aux outils du système : gestionnaire des tâches, éditeur du
  registre, invite de commandes et consoles d'administration sont protégés, même si
  vous demandez explicitement à les bloquer.

## Supprimer vos données

Désinstaller Vethos ne supprime pas le dossier ci-dessus — c'est volontaire, pour
qu'une réinstallation vous retrouve. Pour tout effacer, supprimez ce dossier à la
main.

**Il n'existe aucune récupération de mot de passe.** Le compte est local et rien
n'est envoyé à un serveur : personne ne peut vous le renvoyer. Si vous l'oubliez,
supprimez `nexus_auth.json` dans le dossier ci-dessus pour repartir d'un compte
neuf — vos autres données restent en place.
