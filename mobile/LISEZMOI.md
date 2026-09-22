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

Déjà fait, à ne pas refaire : le projet est lié à EAS
(`@justin-katula/vethos`), `eas.json` porte les profils, et les trois
extensions natives sont déclarées. Il reste **trois commandes**.

```bash
npx eas-cli secret:create --scope project --name APPLE_TEAM_ID --value XXXXXXXXXX
npx eas-cli device:create
npx eas-cli build -p ios --profile development
```

1. **Ton identifiant d'équipe**, dix caractères, lu sur l'espace développeur
   Apple (Membership) ou dans Xcode. En *secret* et pas dans un fichier : il
   identifie *une personne*, pas le produit, et n'a rien à faire dans le
   dépôt. En local, la variable `APPLE_TEAM_ID` fait la même chose.
2. **`device:create`** enregistre ton iPhone auprès d'Apple — une compilation
   de développement ne s'installe que sur des appareils connus. Tu scannes un
   QR code avec le téléphone.
3. **`build`** demande ton identifiant Apple, fabrique les certificats et les
   profils, compile dans le nuage (~15 min) et rend un lien d'installation.

Ce qu'il faut savoir avant de payer les 99 $ :

- **Apple demande quatre identifiants**, pas un — l'application et ses trois
  extensions : `com.vethos.app`, plus `.ActivityMonitorExtension`,
  `.ShieldAction`, `.ShieldConfiguration`. EAS les crée tout seul.
- **`family-controls` en développement** s'obtient avec l'abonnement, sans
  formulaire. C'est la version **distribution** — celle de l'App Store — qui
  se demande à Apple et prend des jours. Pour l'installer sur ton téléphone
  et voir le blocage marcher, le développement suffit.
- **Une compilation de développement expire au bout de 12 mois**, et elle a
  besoin du serveur Metro pour charger le code — exactement comme Expo Go,
  mais avec le Temps d'écran dedans.

### Ce que la compilation apporte, et qu'Expo Go ne peut pas montrer

Quatre mécanismes ne s'allument que sur une version compilée. Tout est déjà
écrit et testé ; c'est l'accès au Temps d'écran qui manque, pas le code.

| | Ce qui se passe |
|---|---|
| **Le bouclier** | L'écran qu'on voit en ouvrant une application écartée. Il porte le thème de Vethos, le nom de l'application — substitué par l'extension, jamais lu par l'application — et le bloc en cours avec son heure de fin. |
| **Écarter** | Seule la sélection est masquée. Applications, catégories **et sites web** : un site laissé de côté reste à un geste. |
| **Focus profond** | Tout est masqué sauf une liste gardée. Garde Vethos dedans, sinon la seule sortie passe par les Réglages d'iOS. |
| **Le filtre web** | Celui d'Apple, pas une liste à nous : une liste qu'on maintient vieillit et laisse passer ce qu'elle promet d'écarter. |

### Quand ça ne marche pas

L'écran Blocage porte un bouton **« Check with iOS now »**. C'est la seule
partie de l'écran qui ne soit pas une déclaration d'intention : tout le reste
dit ce que Vethos a *demandé* à iOS, celle-ci rapporte ce qu'iOS *fait*.

```
module        native            ← « simulated » = Expo Go, rien n'est réel
auth          2 → accordee      ← la valeur d'iOS, puis notre lecture
monitors      3                 ← surveillances posées par Vethos
shield        up
web filter    off
```

Lis la ligne `auth` en premier, et lis-la **entière**. Le défaut le plus cher
du projet a vécu exactement là : iOS rendait `2` (accordée), le pont le
comparait aux chaînes `'approved'` / `'denied'` qui n'existent nulle part
dans le greffon, et les trois états retombaient sur « jamais demandée ».
Résultat sur l'appareil : on accorde le Temps d'écran, et l'écran affiche
« Allow » pour toujours. Le bouton du sélecteur reste éteint, aucune
application ne peut être désignée, rien ne peut être masqué.

Si les deux côtés de la flèche ne concordent pas, c'est là qu'il faut
regarder — pas ailleurs.

---

## Vérifier avant d'envoyer

```bash
npm run typecheck && npm test && npm run audit:a11y
```

Le dernier vérifie que chaque bouton et chaque champ se déclare et se nomme :
ce sont des défauts qu'aucune capture d'écran ne montre.
