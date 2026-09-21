# Vethos sur iPhone — comment le lancer

Deux chemins. Le premier marche tout de suite ; le second est le seul qui
masque vraiment des applications.

---

## 1. Sur ton téléphone, maintenant — Expo Go

```bash
npm run telephone
```

Le terminal affiche un QR code. Scanne-le avec l'appareil photo de l'iPhone
(ou ouvre **Expo Go → Enter URL manually** et tape l'adresse `exp://…:8081`).

L'ordinateur et le téléphone doivent être sur le **même Wi-Fi**. Si le réseau
isole ses appareils les uns des autres — Wi-Fi d'université, d'hôtel,
d'entreprise — le QR ne se chargera pas. Dans ce cas :

```bash
npm run telephone:tunnel
```

**Ce qui marche par ce chemin :** tout. Le moteur de planification, « Je
commence », les mesures, la projection, le thème, l'introduction.

**Ce qui ne marche pas :** le masquage réel des applications. Expo Go ne
contient pas le module du Temps d'écran d'Apple. L'écran Blocage le dit
lui-même — « Simulé sur cet appareil » — et tout le reste de cet écran reste
vrai : autorisation, sélection, séances programmées.

---

## 2. Le vrai blocage — une version compilée

Le masquage demande `FamilyControls`, qui ne peut pas vivre dans Expo Go. Il
faut une compilation à toi, signée avec ton compte Apple.

```bash
npm run build:dev
```

Trois choses sont nécessaires avant, et aucune ne dépend du code :

1. **Un compte Apple Developer** (99 $/an). C'est lui qui signe.
2. **`ios.appleTeamId` dans `app.json`.** Il se lit dans Xcode ou sur
   l'espace développeur Apple. Sans lui, la compilation échoue — le
   serveur de développement le signale déjà à chaque démarrage.
3. **L'entitlement `com.apple.developer.family-controls` en distribution.**
   Apple ne l'accorde pas automatiquement : il se demande par un formulaire,
   et la réponse prend des jours. Il est déjà déclaré dans `app.json` ; c'est
   l'autorisation côté Apple qui manque, pas la déclaration.

Tant que le point 3 n'est pas obtenu, une compilation s'installe et tourne,
mais le Temps d'écran refuse l'autorisation — l'écran Blocage restera sur
« Autoriser » sans effet.

---

## Vérifier avant d'envoyer

```bash
npm run typecheck && npm test && npm run audit:a11y
```

Le dernier vérifie que chaque bouton et chaque champ se déclare et se nomme :
ce sont des défauts qu'aucune capture d'écran ne montre.
