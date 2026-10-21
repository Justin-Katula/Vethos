# Fiche App Store — Vethos: Plan & Focus (version 1.0)

Tout ce qui est en anglais se copie-colle tel quel dans App Store Connect.

---

## 1. App Information (onglet « App Information »)

| Champ | Valeur |
|---|---|
| Name | `Vethos: Plan & Focus` (déjà fait) |
| Subtitle (30 max) | `Plan your day. Block the rest` |
| Primary Category | **Productivity** |
| Secondary Category | **Education** (facultatif) |
| Content Rights | « No, it does not contain, show, or access third-party content » |
| Age Rating | voir §6 |

## 2. Version 1.0 (onglet « iOS App » → 1.0 Prepare for Submission)

**Promotional Text** (170 max, modifiable sans nouvelle version)

```
Tell Vethos what you need to get done. It builds your week around your life, blocks the apps that pull you away, and holds you to the plan.
```

**Description**

```
Vethos turns what you have to do into a plan you actually follow.

TELL IT WHAT MATTERS
• Tasks with a deadline: "Finish my report, 6 hours, before Friday."
• Goals with weekly hours: "Study for my exams, 15 hours a week."
• Anchors for what can't move: classes, work shifts, practice.

IT BUILDS YOUR WEEK
Vethos places every session around your sleep and your anchors. What you ask for is what gets planned: 15 hours a week means 15 hours on your schedule. If something can't fit before its deadline, Vethos tells you right away.

IT BLOCKS THE REST
When a session starts, the apps you chose are set aside with Apple's Screen Time. Vethos never sees which apps you picked or what you do in them.

IT HOLDS YOU TO IT
• A reminder when it's time: tap "I'm starting" right from the notification.
• Want to stop early or push a session to later? Write what happened first.
• Vethos learns how long you really hold on each task and shapes your sessions to match.
• When a goal is too much, or too easy, Vethos suggests a new target. You decide.

YOUR DATA
Sign in with Apple or Google. Your plans come back on any iPhone you sign in to. No ads, no trackers.

SUBSCRIPTION
Vethos requires a Vethos Pro subscription: monthly, or yearly with a 1-week free trial. Payment is charged to your Apple ID at confirmation of purchase (after the trial, for the yearly plan). The subscription renews automatically unless it is cancelled at least 24 hours before the end of the current period. Manage or cancel it in your Apple ID settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://justin-katula.github.io/Vethos/privacy.html
```

**Keywords** (100 max — 98 caractères, sans espaces après les virgules)

```
procrastination,app blocker,screen time,productivity,study,schedule,timer,habit,deep work,deadline
```

| Champ | Valeur |
|---|---|
| Support URL | `https://justin-katula.github.io/Vethos/support.html` |
| Marketing URL | laisser vide |
| Copyright | `2026 Obedi Katula Justin` |
| Version | `1.0` |

**Captures d'écran** : iPhone **6,9"** (1320 × 2868 ou 2868 × 1320), 3 à 10. Prises sur l'iPhone depuis TestFlight :
1. La journée planifiée (onglet Today)
2. Une séance en cours avec le blocage actif
3. La création d'un engagement (tâche avec échéance ou objectif)
4. La notification « I'm starting »
5. L'onglet Blocking (choix des apps)

## 3. Privacy Policy URL (onglet « App Privacy »)

`https://justin-katula.github.io/Vethos/privacy.html`

## 4. App Privacy — le questionnaire

**Do you or your third-party partners collect data from this app?** → **Yes**

Cocher ces types de données. Pour **chacun** : usage = **App Functionality** seulement · **Linked to the user = Yes** · **Used for tracking = No**.

| Catégorie | Type | Pourquoi |
|---|---|---|
| Contact Info | **Email Address** | Connexion Apple / Google |
| Contact Info | **Name** | Si l'utilisateur le partage à la connexion |
| Identifiers | **User ID** | Identifiant du compte (Supabase, RevenueCat) |
| Purchases | **Purchase History** | Statut de l'abonnement (RevenueCat) |
| User Content | **Other User Content** | Tâches, objectifs, ancres, et le texte écrit pour Stop / Later (examen IA) |
| Usage Data | **Product Interaction** | Historique des séances (sauvegardé dans le compte) |

Ne rien cocher d'autre : pas de localisation, pas de contacts, pas de santé, pas de publicité, pas d'analytique, pas de diagnostics.

## 5. Abonnements (Features → Subscriptions)

Pour chaque abonnement : **Localization (English)** + **Review Screenshot** (capture de l'écran d'abonnement de l'app) + **Review Notes**.

| | Monthly | Yearly |
|---|---|---|
| Display Name | `Vethos Pro Monthly` | `Vethos Pro Yearly` |
| Description (55 max) | `Full access to Vethos, billed monthly.` | `Full access to Vethos. 1-week free trial.` |

Puis, dans la page de la version 1.0 → section **In-App Purchases and Subscriptions** → **+** → cocher les deux. Ils partent avec la première soumission.

## 6. Age Rating (questionnaire)

Tout à **None / No**. Pas d'accès web libre, pas de contenu généré partagé entre utilisateurs, pas de messagerie, pas de jeux de hasard, pas de contenu médical. Résultat attendu : **4+**.

## 7. App Review Information

**Sign-in required** → cocher. Pas de compte de démonstration : l'app n'a que « Continue with Apple » et « Continue with Google ».

| Champ | Valeur |
|---|---|
| Contact | Obedi Katula Justin, ton téléphone, `justin@katulalabs.com` |

**Notes** (copier-coller)

```
Sign-in: Vethos only offers Sign in with Apple and Sign in with Google, so no demo account is needed. Any Apple ID works with "Continue with Apple".

Subscription: after sign-in, Vethos requires Vethos Pro. Please use a sandbox account: the yearly plan includes a 1-week free trial. Restore, Terms of Use (Apple standard EULA) and Privacy Policy are on the subscription screen.

Screen Time: blocking uses the Family Controls framework (FamilyActivityPicker, ManagedSettings, DeviceActivity). During onboarding, Vethos asks for Screen Time access ("Lock my distractions"); allow it, then pick apps to block. Apps can be changed later in the Blocking tab. During a work session, the picked apps are shielded until the session ends. Vethos never sees which apps were picked.

To see it quickly: Commitments tab → + → add a task due tomorrow → the Today tab shows the session; tap "I'm starting" when it begins.

AI review: when a user ends a session early (Stop) or postpones it (Later), they write what happened. With the user's permission (asked during onboarding, can be turned off in Profile → AI review; Profile opens from the avatar on the Today tab), that text is reviewed by a language model (DeepSeek) through our server. Without permission, fixed rules decide and nothing is sent.

Account deletion: Profile → Account → Delete account.
```
