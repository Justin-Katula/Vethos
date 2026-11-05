# Pub 03 — « Le F »

Format : vertical 1080×1920, **35 s**, pour Reels / TikTok / Shorts. Textes à l'écran en anglais, comme l'app.
Musique : une seule piste. Elle est sourde et lente dans la partie 1, se coupe net sur le F, puis devient claire et légère dans la partie 2.

Le même personnage dans les deux parties : un étudiant d'environ 17-20 ans, sweat à capuche gris et sac à dos. On ne voit jamais son visage de près (pas de visage = moins de risque que l'IA le déforme d'un plan à l'autre).

## Partie 1 — sans Vethos (0 → 19 s)

| # | Durée | Plan | Texte à l'écran |
|---|---|---|---|
| 1 | 0,0–2,5 s | **Accroche.** Porte de chambre qui s'ouvre, fin d'après-midi. Il lâche son sac sur le lit. | `Test in 7 days.` |
| 2 | 2,5–5,0 s | Il s'assoit au bureau, ouvre un cahier. Lampe allumée. Le téléphone est posé à côté, écran vers le bas. | — |
| 3 | 5,0–7,0 s | Gros plan : le téléphone vibre. Il le retourne. | — |
| 4 | 7,0–10,0 s | Il est sur le lit et fait défiler son téléphone (icônes inventées, aucune vraie app). La lumière passe de l'orange au bleu de la nuit. | `Just 5 minutes.` |
| 5 | 10,0–13,0 s | **Calendrier mural.** Les jours se barrent un à un, vite. Le cahier fermé, toujours au même endroit, se couvre de poussière. | `6 days` → `3 days` → `1 day` |
| 6 | 13,0–16,0 s | Nuit blanche. Il travaille au bureau sous la lampe, canette vide, cernes. | `Test day.` |
| 7 | 16,0–19,0 s | **La copie rendue.** Gros plan sur une feuille posée sur une table d'école : un **F** rouge entouré. Silence, la musique se coupe. | — |

## Pont (19 → 21 s)

| # | Durée | Plan | Texte à l'écran |
|---|---|---|---|
| 8 | 19,0–21,0 s | Écran noir, puis le logo Vethos (bouclier argent). | `Same week. With Vethos.` |

## Partie 2 — avec Vethos (21 → 35 s)

| # | Durée | Plan | Texte à l'écran |
|---|---|---|---|
| 9 | 21,0–23,5 s | Même porte, même sac. Il ouvre Vethos et ajoute la tâche (**vrai écran** : Commitments → +). | `Test in 7 days.` |
| 10 | 23,5–27,0 s | **Vrai écran** : le plan de la semaine, les séances bien réparties jour après jour. | — |
| 11 | 27,0–29,5 s | 10 h 00. Notification « I'm starting », le pouce appuie. Le téléphone qui affiche le bouclier est posé loin du bureau. | — |
| 12 | 29,5–32,0 s | Montage rapide, trois plans de 0,8 s : basket dehors avec des amis, jeu vidéo, coucher de soleil. | `Free time. Actually free.` |
| 13 | 32,0–33,5 s | La copie : un **A** entouré. | — |
| 14 | 33,5–35,0 s | Fin : logo et icône de l'app. | `Vethos — on the App Store` |

## Qui fait quoi

- **Blender** : la chambre (une seule pièce réutilisée pour les plans 1-4, 6, 9 et 11), le calendrier, les copies F/A, l'iPhone dont l'écran affiche les vrais enregistrements de Vethos. Blender rend une image clé par plan.
- **IA vidéo** : chaque image clé devient un plan de 2-3 s (« image vers vidéo »). Elle donne le mouvement, la peau et la lumière. L'écran du téléphone est recollé par-dessus au montage, pour que le texte reste net.
- **Montage** : script Python + ffmpeg, comme pour la pub 02 (`marketing/pub-02/montage.py`).
- **Vrais écrans** (plans 9, 10, 11) : enregistrés depuis l'app avec les outils déjà utilisés pour l'onboarding.
