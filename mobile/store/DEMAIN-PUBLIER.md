# Publier Vethos — la liste du matin

Tout est prêt côté code. Coche dans l'ordre.

## A. Tester la build sur l'iPhone (15 min)

1. Supprime l'app Vethos de l'iPhone (appui long → Supprimer l'app).
2. TestFlight → installe la **dernière** build (le plus grand numéro).
3. Vérifie, dans l'ordre :
   - [ ] l'onboarding s'affiche au premier lancement ;
   - [ ] « Lock my distractions » ouvre la demande du Temps d'écran ;
   - [ ] la connexion Apple **et** la connexion Google marchent ;
   - [ ] l'écran d'abonnement s'affiche avec les deux formules et leurs prix ;
   - [ ] l'achat en test (sandbox) marche → l'app s'ouvre (rien n'est facturé) ;
   - [ ] l'onglet Today montre ta journée ; une tâche ajoutée apparaît dans le plan.

## B. Captures d'écran (15 min)

Sur l'iPhone, bouton latéral + volume haut. Il en faut **3 à 10**, au format 6,9" (un iPhone 15/16/17 Pro Max les donne directement ; sinon on les redimensionne à 1320 × 2868).
- [ ] Today (la journée planifiée)
- [ ] My time (la semaine)
- [ ] Commitments
- [ ] L'écran de blocage / Blocking
- [ ] L'écran d'abonnement → sert aussi de **Review Screenshot** pour les deux abonnements

## C. App Store Connect (20 min) — tout est dans `fiche-app-store.md`

- [ ] **App Information** : sous-titre, catégorie Productivity, Age Rating (tout à None → 4+)
- [ ] **App Privacy** : URL + les 7 types de données (tableau §4)
- [ ] **Version 1.0** : captures, texte promo, description, mots-clés, Support URL, copyright
- [ ] **Build** : choisis la dernière build
- [ ] **Abonnements** (Monthly + Yearly) : nom affiché, description, Review Screenshot
- [ ] Version 1.0 → **In-App Purchases and Subscriptions** → **+** → coche les deux
- [ ] **App Review Information** : coche « Sign-in required », colle les Notes, ton téléphone et ton e-mail
- [ ] **Pricing and Availability** : Free, tous les pays (l'UE suivra quand le DSA sera validé)

## D. Juste avant « Submit for Review »

- [ ] **Supabase → plan Pro (25 $ US/mois)**. Sinon le serveur se remet en pause après une semaine calme et l'app ne marche plus, pour personne — y compris pour l'équipe de révision.
- [ ] **Submit for Review**. Réponse d'Apple en général sous 1 à 3 jours.

## Ce qui a été corrigé cette nuit (déjà dans la dernière build)

- Un premier lancement restait bloqué sur le logo qui respire.
- Les heures écrites collaient deux blocs (« 18:00 → 18:45 » puis « 18:45 → … ») alors que la pause de 5 min existe : elles s'arrêtent maintenant à la fin du travail.
- « 1 fixed slots », « 1 times a week », « about 1 times » → singulier.
- La Projection comptait les parties d'une tâche comme des tâches (« Tasks 4 » pour 2 tâches).
- L'écran d'abonnement : « Try again » si le Store ne renvoie aucune formule (au lieu d'un bouton éteint pour toujours) ; l'app ne reste plus sur le logo si le Store ne répond pas ; « Sign out » ajouté en bas.
- Les rappels « I'm starting » sont programmés aussi pour demain et après-demain (avant : seulement pour aujourd'hui, donc rien si l'app n'était pas ouverte un matin).
- VoiceOver disait « Chargement de Vethos » en français.
