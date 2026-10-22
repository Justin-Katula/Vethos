import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { useDonnees } from '@/donnees/magasin'
import { useSeances } from '@/seances/magasin-seances'
import { useBlocage } from '@/blocage/etat'
import { fusionnerAuto, memesPlages, plagesAuto, plagesAVenir } from '@/blocage/blocage-auto'
import { empreinteRappels, rappelsAProgrammer } from '@/seances/rappels-plan'
import { demanderAutorisation, preparerRappels, programmerRappels } from '@/seances/rappels'
import { selectionEstVide } from '@/blocage/contrat'
import { plageDeSeance } from '@/blocage/pont-seance'
import { arreter, confirmer, seanceActive, tictac } from '@/seances/pendule'
import { decalageAncre, decalerAncre, decalageRestant, journalContextFor, overlayDueFor, recordDailyUtilization, setBlockedAttempts } from '@shared/planning/clock'
import { elementPliable, figerIdeaux, historiqueCreations, pliesDuJour } from '@shared/planning/pliement'
import { lireTexteArret } from '@shared/coach/coach'
import { dueRemovals } from '@shared/contract'
import { detecteDetresse, disciplineSuspendue, MESSAGE_AIDE, SUJET_DETRESSE } from '@shared/coach/garde-fous'
import { pontEcran } from '@/blocage/ecran-natif'
import { addDays } from '@shared/planning/dates'
import type { LearningState, StopReason } from '@shared/schemas'
import { minutesDe } from '@/donnees/regle-sommeil'
import { useNomTheme } from '@/theme/Theme'
import { accepterProlongation, dansLaProlongation, marquerOffre, proposerProlongation } from '@shared/planning/prolongation'
import { jourLibrePropose } from '@shared/planning/jours-libres'
import {
  ATTENTE_STOP_MINUTES,
  accorderDixMinutes,
  choisirRattrapage,
  continuer,
  demanderStop,
  dixMinutesEchues,
  executerStop,
  fermerPause,
  finUrgence,
  niveauConfiance,
  optionsUrgence,
  ouvrirUrgence,
  preparerStop,
  prendreSouffle,
  promesseDuBloc,
  reporterEnUrgence,
  retourDuSouffle,
  souffleAvant,
  souffleDisponible,
  stopEchu,
  stopPermis,
  tentativesPendantUrgence,
  urgenceActive,
  urgenceTropFrequente,
  type OptionRattrapage,
} from '@shared/planning/trust'
import { IDENTIFIANT_URGENCE } from '@/blocage/contrat'
import { cleDate, dernierJourDe, entreeEtPlan } from './moteur'
import {
  evenementDuReport,
  journeeReportable,
  noterReport,
  texteSuffisant,
  optionsPlusTard,
  pliesParReport,
  plusTardPermis,
  reportJourneePermis,
  travailDuJour,
  type OptionPlusTard,
} from '@shared/planning/report'
import { creerPromesses, echeanceDe, empreinteRattrapage, reactionRaison, type Placement } from '@shared/planning/trust'
import { addDays as ajouterJours, daysBetween } from '@shared/planning/dates'
import { coach } from '@/coach/client'
import type { ReponseArbitre } from '@shared/coach/client'
import { exclureDuTravail, historiquePourJuge, noterJustification, reglesFixes } from '@shared/planning/justification'
import { lireSemaine, seancesTenues } from './lecture'
import { liberationsDuJour } from './bonus-tache'

/**
 * « Later » : la séance devient une promesse à l'heure choisie, et sa source
 * ne se place plus aujourd'hui (la promesse, elle, reste posée).
 */
type BlocReportable = { id: string; kind: string; refId: string; workMinutes: number; label: string }
export type OptionPlusTardVue = OptionPlusTard & { demainMinutes: number; placement: Placement }
export type ReactionPlusTard =
  | { etape: 'message'; message: string }
  | {
      etape: 'reaction'
      lignes: string[]
      dixMinutes: boolean
      /** Sans quelques mots d'explication, pas de report : seul « Je commence » reste. */
      sansTexte: boolean
      options: OptionPlusTardVue[]
      /** « Tomorrow » : null s'il n'est pas permis cette semaine ou ne tient pas. */
      journee: { aujourdhuiMinutes: number; demainAvant: number; demainApres: number } | null
    }

function reporterPlusTard(
  l: LearningState,
  bloc: { id: string; kind: string; refId: string; workMinutes: number; label: string },
  option: OptionPlusTard,
  aujourdHui: string,
  raison?: StopReason,
  placement?: Placement,
): LearningState {
  // Comme le rattrapage d'un Stop : « trop dur » / « ennuyeux » → blocs de 25 min,
  // « distrait » → mode profond.
  const avecPromesse = creerPromesses(l, {
    id: `report-${bloc.id}`,
    kind: bloc.kind as 'task' | 'objective',
    refId: bloc.refId,
    label: bloc.label,
    fromBlockId: bloc.id,
    date: option.date,
    startMinute: option.startMinute,
    minutes: Math.max(1, Math.min(600, bloc.workMinutes)),
    createdAt: new Date().toISOString(),
    ...(placement?.deep ? { deep: true } : {}),
  }, placement?.morceau)
  return noterReport(avecPromesse, { date: aujourdHui, kind: 'later', blockId: bloc.id, refId: bloc.refId, ...(raison ? { reason: raison } : {}) })
}

function useSourcePlan() {
  const { taches, objectifs, ancres, obligations, reglages, chargees, terminerTaches, libererBonus, supprimerObjectif, majReglages } = useDonnees()
  const { apprentissage, confirmations, chargees: mesuresPretes, poser } = useSeances()
  // Le bouclier s'affiche dans un AUTRE processus, qui n'a pas notre thème et
  // ne peut pas le demander : ses couleurs se figent au moment où on le pose.
  const theme = useNomTheme()

  const [instant, setInstant] = useState(() => Math.floor(Date.now() / 60_000) * 60_000)
  useEffect(() => {
    const actualiser = () => setInstant(Math.floor(Date.now() / 60_000) * 60_000)
    const intervalle = setInterval(actualiser, 1000)
    const retour = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') actualiser()
    })
    return () => { clearInterval(intervalle); retour.remove() }
  }, [])

  /** Le nom et la couleur d'une séance du journal, même pour une tâche finie. */
  const titreDe = useCallback((kind: 'task' | 'objective' | 'ancre', refId: string) => {
    if (kind === 'task') {
      const t = taches.find((x) => x.id === refId)
      return t ? { titre: t.titre, ...(t.couleur ? { couleur: t.couleur } : {}) } : null
    }
    if (kind === 'objective') {
      const o = objectifs.find((x) => x.id === refId)
      return o ? { titre: o.nom, couleur: o.couleur } : null
    }
    const a = ancres.find((x) => x.id === refId)
    return a ? { titre: a.nom } : null
  }, [taches, objectifs, ancres])

  // Ce qui ne se place pas aujourd'hui : les pliages d'un Stop, et les reports
  // (« Later » retire la séance, sa promesse reste ; « Tomorrow » retire tout).
  const refsDuJour = useMemo(
    () => [...taches.filter((t) => !t.terminee).map((t) => t.id), ...objectifs.map((o) => o.id)],
    [taches, objectifs],
  )
  const pliesDe = useCallback(
    (l: typeof apprentissage, c: typeof confirmations, aujourdHui: string) => [
      ...new Set([
        ...(c.date === aujourdHui ? pliesDuJour(l, c) : []),
        ...pliesParReport(l, aujourdHui, refsDuJour),
      ]),
    ],
    [refsDuJour],
  )

  const prets = chargees && mesuresPretes

  const calculFrais = useMemo(() => {
    const maintenant = new Date(instant)
    const aujourdHui = cleDate(maintenant)
    const minute = maintenant.getHours() * 60 + maintenant.getMinutes()

    // D.7 : la séance confirmée en cours est lue AVANT le calcul et entre
    // dedans. Elle se produit déjà, donc elle ne se replace pas — sans quoi
    // chaque recalcul la repousserait d'une minute vers l'avant, indéfiniment.
    const active = seanceActive(confirmations, aujourdHui, minute)

    const { entree, resultat } = entreeEtPlan({
      taches, objectifs, ancres, obligations, reglages, maintenant,
      apprentissage, seanceActive: active,
      plies: pliesDe(apprentissage, confirmations, aujourdHui),
    })
    // Aujourd'hui, les séances déjà faites restent sur la carte, avant le plan.
    const faites = seancesTenues(apprentissage.sessionEvents ?? [], aujourdHui, titreDe)
    const jours = lireSemaine(resultat, obligations, reglages).map((j) =>
      j.date === aujourdHui && faites.length ? { ...j, segments: [...j.segments, ...faites].sort((a, b) => a.debut - b.debut) } : j,
    )
    return { resultat, entree, jours, maintenant, aujourdHui, minute,
      chargees: chargees && mesuresPretes, seanceActive: active }
  }, [taches, objectifs, ancres, obligations, reglages, instant, chargees,
      apprentissage, confirmations, mesuresPretes, titreDe, pliesDe])

  // Le dernier plan calculé sur des données LUES. Tant qu'un tiroir se recharge
  // (changement de compte, rechargement à chaud), le plan d'avant reste affiché :
  // un plan calculé sur un état vide ferait disparaître tous les blocs, puis les
  // ferait revenir quelques instants plus tard.
  const dernierBonCalcul = useRef<typeof calculFrais | null>(null)
  if (prets) dernierBonCalcul.current = calculFrais
  const calcul = !prets && dernierBonCalcul.current ? dernierBonCalcul.current : calculFrais

  // Les aperçus sont écartés UNE FOIS, ici : une partie encore verrouillée
  // (B.5.1) ne se confirme pas, ne bloque rien et ne crédite aucun travail.
  // En oublier un seul endroit rouvrirait la porte à une confirmation sur une
  // partie qui n'a pas encore le droit de commencer.
  const blocsDuJour = useMemo(
    () => calcul.resultat.blocks.filter((b) => b.date === calcul.aujourdHui && b.preview !== true),
    [calcul.resultat, calcul.aujourdHui],
  )

  // Le blocage commence à l'heure, sans attendre « Je commence » : chaque bloc
  // pas encore confirmé reçoit son écart (une heure au plus), qu'iOS applique
  // lui-même, Vethos fermé. On ne reprogramme iOS que si les plages voulues
  // ont changé — pas à chaque minute.
  const dernieresVoulues = useRef<string | null>(null)
  const levee = useBlocage((e) => e.levee)
  useEffect(() => {
    if (!prets) return
    const b = useBlocage.getState()
    const selection = b.selection
    if (!selection || selectionEstVide(selection)) return
    const confirmes = new Set(Object.keys(confirmations.confirmedAt))
    // Une suspension ne vaut que pour SON jour.
    const leveeJusqua = levee && levee.date === calcul.aujourdHui ? levee.minute : null
    const auto = plagesAuto({ blocsDuJour, confirmes, nowMinute: calcul.minute, selectionId: selection.identifiant, leveeJusqua })
    // Demain et après-demain aussi : iOS bloque à l'heure même si Vethos n'est
    // pas ouvert ce jour-là.
    const avenir = plagesAVenir(
      [1, 2].map((k) => {
        const date = addDays(calcul.aujourdHui, k)
        return { date, blocs: calcul.resultat.blocks.filter((x) => x.date === date && x.preview !== true) }
      }),
      selection.identifiant,
    )
    const voulues = fusionnerAuto({ actives: b.plagesActives, auto: [...auto, ...avenir], idsDuPlan: new Set(blocsDuJour.map((x) => x.id)), confirmes })
    const cle = JSON.stringify(voulues.map((p) => [p.date ?? '', p.blocId, p.debutMinute, p.finMinute]).sort())
    if (cle === dernieresVoulues.current || memesPlages(voulues, b.plagesActives)) {
      dernieresVoulues.current = cle
      return
    }
    dernieresVoulues.current = cle
    // Le bouclier nomme le prochain bloc écarté — sauf pendant une séance, qui garde le sien.
    const prochain = [...auto].sort((x, y) => x.debutMinute - y.debutMinute)[0]
    const bloc = prochain && blocsDuJour.find((x) => x.id === prochain.blocId)
    if (bloc && prochain && !calcul.seanceActive) b.habiller({ theme, titreBloc: bloc.label, finMinute: prochain.finMinute })
    void b.appliquerPlan(voulues)
  }, [prets, blocsDuJour, confirmations.confirmedAt, calcul.minute, calcul.seanceActive, calcul.aujourdHui, calcul.resultat, theme, levee])

  // Les rappels de « Je commence » : toutes les 3 min dès le début du bloc,
  // vingt au plus, jusqu'à la confirmation. Reprogrammés quand ils changent.
  const derniersRappels = useRef<string | null>(null)
  useEffect(() => {
    if (!prets) return
    const minuit = new Date(calcul.maintenant)
    minuit.setHours(0, 0, 0, 0)
    // Demain et après-demain : préavis et appel à l'heure, au cas où Vethos
    // ne serait pas ouvert d'ici là. Chaque ouverture les recalcule.
    const aVenir = [1, 2].map((k) => {
      const m = new Date(minuit)
      m.setDate(m.getDate() + k)
      const date = addDays(calcul.aujourdHui, k)
      return { minuitMs: m.getTime(), blocs: calcul.resultat.blocks.filter((b) => b.date === date && b.preview !== true) }
    })
    const rappels = rappelsAProgrammer({
      blocsDuJour,
      confirmes: new Set(Object.keys(confirmations.confirmedAt)),
      minuitMs: minuit.getTime(),
      maintenantMs: Date.now(),
      aVenir,
    })
    const e = empreinteRappels(rappels)
    if (e === derniersRappels.current) return
    derniersRappels.current = e
    void (async () => {
      await preparerRappels()
      if (rappels.length > 0) await demanderAutorisation()
      await programmerRappels(rappels)
    })()
  }, [prets, blocsDuJour, confirmations.confirmedAt, calcul.maintenant, calcul.resultat, calcul.aujourdHui])

  // Diagnostic de développement : si le plan perd des blocs d'un instant à l'autre,
  // la cause est écrite dans la console de Metro (données rechargées, tâches
  // retirées, ou simple recalcul). Sans cela, « les blocs disparaissent puis
  // reviennent » ne laisse aucune trace.
  const traceBlocs = useRef<{ blocs: number; taches: number; prets: boolean } | null>(null)
  useEffect(() => {
    if (!__DEV__) return
    const maintenant = { blocs: calcul.resultat.blocks.filter((b) => b.date === calcul.aujourdHui).length, taches: taches.length, prets }
    const avant = traceBlocs.current
    if (avant && (maintenant.blocs < avant.blocs || maintenant.taches < avant.taches || maintenant.prets !== avant.prets)) {
      console.warn(`[plan] ${new Date().toLocaleTimeString()} blocs du jour ${avant.blocs}→${maintenant.blocs} · tâches ${avant.taches}→${maintenant.taches} · données prêtes ${avant.prets}→${maintenant.prets}`)
    }
    traceBlocs.current = maintenant
  }, [calcul.resultat, calcul.aujourdHui, taches.length, prets])

  const tic = useMemo(
    () => (mesuresPretes && chargees
      ? tictac({ maintenant: calcul.maintenant, aujourdHui: calcul.aujourdHui,
          blocsDuJour, taches, etat: { apprentissage, confirmations },
          suspendu: disciplineSuspendue(apprentissage.lastSignalAt, calcul.maintenant),
          contexteRate: journalContextFor({
            learning: apprentissage,
            today: calcul.aujourdHui,
            yesterday: addDays(calcul.aujourdHui, -1),
            nowMinute: calcul.minute,
            wakeMinute: minutesDe(reglages.lever),
          }) })
      : null),
    [mesuresPretes, chargees, calcul.maintenant, calcul.minute, calcul.aujourdHui, blocsDuJour, taches,
     apprentissage, confirmations, reglages.lever],
  )

  // Les séances se chargent avec le compte (voir `app/_layout.tsx`) : chaque
  // compte a son tiroir, et le changer recharge le bon.

  // Contrat : un retrait d'objectif demandé il y a 48 h prend effet maintenant.
  useEffect(() => {
    if (!reglages.contrat) return
    const r = dueRemovals(reglages.contrat, new Date(instant))
    if (!r.refIds.length) return
    void (async () => {
      for (const id of r.refIds) await supprimerObjectif(id)
      await majReglages({ contrat: r.contract })
    })()
  }, [instant, reglages.contrat, supprimerObjectif, majReglages])

  // Le tic écrit, le rendu ne doit pas. On range ce qu'il a produit dans un
  // effet, une seule fois par changement réel — `change` est calculé par la
  // pendule elle-même, jamais deviné ici.
  const dernierTic = useRef<string>('')
  // Le recalcul « comme si l'arrêt était accepté », défini plus bas avec le reste du Stop.
  useEffect(() => {
    if (!tic) return
    const empreinte = `${calcul.aujourdHui}|${calcul.minute}`
    if (dernierTic.current === empreinte) return
    dernierTic.current = empreinte
    // Les tentatives d'ouvrir une app écartée, relues depuis l'extension du
    // bouclier : leur nombre depuis le « Je commence » de la séance en cours.
    // La version idéale de chaque tâche : figée la première fois que le plan la pose.
    let appris = figerIdeaux(tic.apprentissage, calcul.resultat, { tasks: calcul.entree.tasks, objectives: calcul.entree.objectives, today: calcul.aujourdHui })
    const o = tic.confirmations.observedPending
    const confirmeA = o ? tic.confirmations.confirmedAt[o.blockId] : undefined
    if (confirmeA !== undefined) {
      const vues = pontEcran().lireTentatives().filter((t) => t >= confirmeA && t <= Date.now())
      appris = setBlockedAttempts(appris, tic.confirmations, vues.length, vues.length ? Math.max(...vues) : undefined)
    }
    // Urgence courte (15 min) : ouvrir une app NON choisie arrête la pause tout de suite.
    let confs = tic.confirmations
    const pause = confs.pause
    if (pause?.kind === 'emergency' && pontEcran().lireTentatives().some((t) => t >= pause.startMs)) {
      const r = finUrgence(appris, confs, { nowMinute: calcul.minute, nowMs: Date.now(), end: 'attempt' })
      appris = r.learning
      confs = r.confirmations
      void useBlocage.getState().reprendre(pause.blockId, calcul.minute)
    }
    // Urgence reportée : l'app regarde. Chaque tentative d'une app non choisie est comptée.
    const u = urgenceActive(confs, Date.now())
    if (u) appris = tentativesPendantUrgence(appris, confs, pontEcran().lireTentatives().filter((t) => t >= u.startMs).length, Date.now())
    // L'attente d'un Stop est finie : la séance s'arrête, le bouclier est déjà
    // levé par iOS, et le reste se plie dans les séances à venir.
    const du = stopEchu(confs, Date.now())
    if (du) {
      const r = executerStop({
        learning: appris,
        confirmations: confs,
        nowMs: Date.now(),
        textReason: du.text ? lireTexteArret(du.text) : null,
      })
      appris = r.learning
      confs = r.confirmations
      void useBlocage.getState().remplacerPlage(du.blockId, null)
    }
    // E.3/E.4 : l'utilisation réelle du jour, pour la fatigue accumulée.
    appris = recordDailyUtilization(appris, calcul.aujourdHui, calcul.resultat.todayFullCapacityMinutes)
    if (tic.change || appris !== tic.apprentissage || confs !== tic.confirmations) void poser({ apprentissage: appris, confirmations: confs })
    if (tic.terminees.length > 0) void terminerTaches(tic.terminees)
    // Le bonus : quelques minutes de plus, libérées quand le plan a du jeu et que
    // les blocs sont tenus. Il devient du travail normal ; il ne touche jamais au
    // plancher demandé (voir `@shared/planning/bonus`).
    const liberations = liberationsDuJour({
      taches,
      resultat: calcul.resultat,
      events: appris.sessionEvents ?? [],
      fait: appris.workedMinutesByRef,
      today: calcul.aujourdHui,
      retardAujourdhui: (appris.dailyDelayMinutes[calcul.aujourdHui] ?? 0) > 0,
    })
    if (liberations.length > 0) void libererBonus(liberations)
  }, [tic, taches, calcul.aujourdHui, calcul.minute, calcul.resultat, calcul.entree, poser, terminerTaches, libererBonus])

  // Retrait progressif : le bloc en attente n'appelle l'overlay que si sa
  // phase le demande (phase 3 : 10 min après, jamais un jour-test ; phase 4 :
  // jamais). Sinon il reste démarrable d'un geste, depuis Today.
  const enAttenteBrut = tic?.enAttente ?? null
  // Détresse vue il y a moins de 24 h : plus d'overlay, plus d'exigence.
  const suspendu = disciplineSuspendue(apprentissage.lastSignalAt, calcul.maintenant)
  const overlayDu =
    !suspendu &&
    enAttenteBrut !== null &&
    // Une promesse appelle toujours l'overlay : c'est un engagement pris.
    (enAttenteBrut.promiseId !== undefined ||
      overlayDueFor({
        learning: apprentissage,
        block: enAttenteBrut,
        nowMinute: calcul.minute,
        today: calcul.aujourdHui,
        decalage: decalageAncre(confirmations, enAttenteBrut.id),
      }))

  // ── Prolongation : l'offre des 2 dernières minutes d'une séance ──────────
  const actif = calcul.seanceActive
  const evenementActif = actif
    ? apprentissage.sessionEvents.find((e) => e.blockId === actif.blockId && e.date === calcul.aujourdHui)
    : undefined
  // Le prochain engagement après la séance : bloc, ancre ou obligation du jour.
  const prochainDebut = (apresMinute: number): number | null => {
    const debuts = (calcul.jours.find((j) => j.date === calcul.aujourdHui)?.segments ?? [])
      .filter((g) => g.nature !== 'sleep' && g.id !== actif?.blockId && g.bloc?.confirmed !== true)
      .map((g) => g.debut)
      .filter((m) => m >= apresMinute)
    return debuts.length ? Math.min(...debuts) : null
  }
  const offre = useMemo(() => {
    // Une ancre ne se prolonge pas : elle tient son heure, puis c'est tout.
    if (!actif || actif.kind === 'ancre' || !evenementActif || suspendu) return null
    const o = confirmations.observedPending
    if (!o || o.blockId !== actif.blockId) return null
    const finTravail = o.startMinute + (o.workMinutes ?? o.endMinute - o.startMinute)
    const cap = calcul.resultat.capacities.find((c) => c.date === calcul.aujourdHui)
    const d = proposerProlongation({
      event: evenementActif,
      session: { blockId: o.blockId, startMinute: o.startMinute, workMinutes: o.workMinutes ?? o.endMinute - o.startMinute },
      nowMinute: calcul.minute,
      nowMs: calcul.maintenant.getTime(),
      today: calcul.aujourdHui,
      events: apprentissage.sessionEvents,
      historique: apprentissage.extensionOffers,
      dejaOfferte: confirmations.extensionOfferedBlockIds.includes(o.blockId),
      prochainDebut: prochainDebut(finTravail),
      coucher: minutesDe(reglages.coucher),
      travailDuJour:
        Math.max(0, finTravail - calcul.minute) +
        blocsDuJour.filter((b) => b.kind !== 'ancre' && b.id !== o.blockId && b.confirmed !== true).reduce((t, b) => t + b.workMinutes, 0),
      capaciteDuJour: cap?.effectiveCapacityMinutes ?? 0,
    })
    return d === null ? null : { blocId: o.blockId, minutes: d }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, evenementActif, suspendu, confirmations, calcul, apprentissage, blocsDuJour, reglages.coucher])
  // Montrée = comptée : une offre par bloc, et le plafond du jour.
  const [offreVisible, setOffreVisible] = useState<{ blocId: string; minutes: number } | null>(null)
  useEffect(() => {
    if (!offre || offreVisible?.blocId === offre.blocId) return
    setOffreVisible(offre)
    const frais = useSeances.getState()
    const m = marquerOffre(frais.apprentissage, frais.confirmations, offre.blocId)
    void poser({ apprentissage: m.learning, confirmations: m.confirmations })
  }, [offre, offreVisible, poser])
  const finDeSeance = actif ? calcul.minute >= actif.endMinute : true
  const prolongationMontree = offreVisible && actif?.blockId === offreVisible.blocId && !finDeSeance ? offreVisible : null

  // ── Jour libre : recalculé à l'heure, pas à la minute (plusieurs plans d'essai) ──
  const heure = Math.floor(calcul.minute / 60)
  const jourLibre = useMemo(() => {
    if (!chargees || !mesuresPretes) return null
    const maintenant = new Date(calcul.maintenant)
    const { entree, resultat } = entreeEtPlan({ taches, objectifs, ancres, obligations, reglages, maintenant, apprentissage })
    return jourLibrePropose({ input: entree, learning: apprentissage, plan: resultat, now: maintenant })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargees, mesuresPretes, taches, objectifs, ancres, obligations, reglages, apprentissage.freeDays, calcul.aujourdHui, heure])


  // ── Stop, promesses et confiance ──────────────────────────────────────────
  const niveau = niveauConfiance(apprentissage.trust)
  const planApres = (l: typeof apprentissage, c: typeof confirmations) => {
    const maintenant = new Date()
    const m = maintenant.getHours() * 60 + maintenant.getMinutes()
    const { entree, resultat } = entreeEtPlan({
      taches, objectifs, ancres, obligations, reglages, maintenant,
      apprentissage: l, seanceActive: seanceActive(c, cleDate(maintenant), m),
      plies: pliesDe(l, c, cleDate(maintenant)),
    })
    return { plan: resultat, input: entree }
  }
  // Ce qui se plie, et les créations passées (la probabilité) — lus du moteur.
  const pliage = (o: { kind: 'task' | 'objective' | 'ancre'; refId: string }) => {
    const { entree } = entreeEtPlan({ taches, objectifs, ancres, obligations, reglages, maintenant: new Date(), apprentissage, jours: 1 })
    return {
      element: elementPliable(o, { tasks: entree.tasks, objectives: entree.objectives, today: entree.today }),
      creations: historiqueCreations({ tasks: entree.tasks, objectives: entree.objectives, ancres: entree.ancres }),
    }
  }
  const coucher = minutesDe(reglages.coucher)
  const lever = minutesDe(reglages.lever)
  const limite = coucher !== null ? coucher - 30 : null
  const blocage = () => useBlocage.getState()
  const confirmationsDuJour = confirmations.date === calcul.aujourdHui ? confirmations : null
  const maintenantMinute = () => {
    const d = new Date()
    return { d, minute: d.getHours() * 60 + d.getMinutes() }
  }
  const tentativesRecentes = (confirmeA: number | undefined) =>
    pontEcran()
      .lireTentatives()
      .filter((t) => Date.now() - t < 10 * 60_000 && (confirmeA === undefined || t >= confirmeA)).length
  /** La trace d'un report au journal : la raison compte, comme celle d'un Stop. */
  const traceDuReport = (bloc: BlocReportable & { startMinute: number }, date: string, raison: StopReason, texte: string, reponseMs?: number) =>
    evenementDuReport({
      bloc: { ...bloc, kind: bloc.kind as 'task' | 'objective' },
      date,
      raison,
      texte,
      raisonTexte: lireTexteArret(texte),
      ...(reponseMs !== undefined ? { answerMs: reponseMs } : {}),
      attemptsBefore: tentativesRecentes(undefined),
      niveau,
      nowIso: new Date().toISOString(),
    })
  const tacheEnCours = (o: { kind: string; refId: string } | null | undefined) =>
    o?.kind === 'task' ? taches.find((t) => t.id === o.refId) : undefined

  const confiance = {
    niveau,
    /** L'attente entre « Oui, j'arrête » et le déblocage, en minutes. */
    attenteMinutes: ATTENTE_STOP_MINUTES[niveau],
    /** Pas de Stop dans un rattrapage, ni après un « pas de place ». */
    stopPermis: !!actif && !!confirmationsDuJour && stopPermis(apprentissage, confirmationsDuJour),
    /** La pause en cours, ou null. */
    pause: confirmationsDuJour?.pause ?? null,
    /** Le souffle est fini : l'overlay attend « Je reprends ». */
    retourAttendu: confirmationsDuJour?.awaitingReturn ?? null,
    /** L'attente d'un Stop confirmé : la séance s'arrête à `untilMs`. */
    stopEnAttente: confirmationsDuJour?.stopPending ?? null,
    /** Le rattrapage à choisir : il n'y a pas d'autre sortie. */
    choixRattrapage: confirmationsDuJour?.promiseChoice ?? null,
    /** L'urgence en cours : tout écarté sauf les apps choisies, jusqu'à l'heure de reprise. */
    urgence: confirmationsDuJour ? urgenceActive(confirmationsDuJour, Date.now()) : null,
    /** Au-delà d'un arrêt sur trois en urgence, l'urgence passe par l'attente. */
    urgenceTropFrequente: urgenceTropFrequente(apprentissage, calcul.aujourdHui),
    /** « J'ai besoin de 15 min » pendant la promesse en cours. */
    souffleEnCours: !!actif && souffleDisponible(apprentissage, actif.blockId) && !confirmationsDuJour?.pause,
    /** « J'ai besoin de 15 min » AVANT une promesse qui attend son départ. */
    souffleAvantPossible: (blockId: string) => souffleDisponible(apprentissage, blockId),
    /** Une ancre est en cours : ni Stop, ni pause. */
    ancre: !!actif && confirmationsDuJour?.observedPending?.kind === 'ancre',
    /** Une ancre pas encore commencée : dans combien de minutes elle peut revenir (0 : plus du tout). */
    ancreDecalable: (bloc: { id: string; kind: string; startMinute: number }) =>
      bloc.kind === 'ancre' && confirmationsDuJour && !(bloc.id in confirmationsDuJour.confirmedAt)
        ? decalageRestant(bloc.startMinute, decalageAncre(confirmationsDuJour, bloc.id), calcul.minute)
        : 0,
    /** « In 5 min » : l'ancre revient plus tard, 15 min au plus après son heure. */
    decalerAncre: async (bloc: { id: string; kind: 'task' | 'objective' | 'ancre'; startMinute: number }) => {
      const frais = useSeances.getState()
      const d = new Date()
      const c = decalerAncre(frais.confirmations, bloc, d.getHours() * 60 + d.getMinutes())
      if (!c) return
      await poser({ apprentissage: frais.apprentissage, confirmations: c })
      // Libre jusqu'à la nouvelle heure de l'ancre ; son blocage reprend à cette heure-là.
      await useBlocage.getState().suspendre(bloc.startMinute + decalageAncre(c, bloc.id))
    },
    /** « 10 more minutes » en cours : l'heure où « Stop ? » revient. */
    dixMinutesJusqua: confirmationsDuJour?.dixMinutes && !confirmationsDuJour.dixMinutes.repondu ? confirmationsDuJour.dixMinutes.untilMs : null,
    /** Les 10 minutes sont passées : la raison à redemander, ou null. */
    dixMinutesEchues: () => {
      const c = useSeances.getState()
      return actif && c.confirmations.date === calcul.aujourdHui && stopPermis(c.apprentissage, c.confirmations)
        ? dixMinutesEchues(c.confirmations, Date.now())
        : null
    },
    /** Le titre du bloc dont on attend le retour. */
    titreRetour: confirmationsDuJour?.awaitingReturn ? (blocsDuJour.find((b) => b.id === confirmationsDuJour.awaitingReturn!.blockId)?.label ?? '') : '',

    /**
     * La raison est donnée : la place, puis la réaction propre à la raison.
     * Rien n'est arrêté — sauf une détresse lue dans le texte : on arrête
     * tout de suite, sans attente, et on oriente vers une aide humaine.
     */
    preparer: async (raison: StopReason, texte?: string) => {
      const frais = useSeances.getState()
      const o = frais.confirmations.observedPending
      if (!o) return { etape: 'rien' as const }
      const { d, minute } = maintenantMinute()
      const confirmeA = frais.confirmations.confirmedAt[o.blockId]
      if (texte && detecteDetresse(texte)) {
        const r = arreter({ maintenant: d, etat: { apprentissage: frais.apprentissage, confirmations: frais.confirmations }, raison, texte })
        if (!r) return { etape: 'rien' as const }
        await poser({
          apprentissage: { ...r.apprentissage, lastSignalAt: { ...r.apprentissage.lastSignalAt, [SUJET_DETRESSE]: d.toISOString() } },
          confirmations: r.confirmations,
        })
        await blocage().remplacerPlage(o.blockId, null)
        return { etape: 'message' as const, message: MESSAGE_AIDE }
      }
      const tache = tacheEnCours(o)
      const r = preparerStop({
        learning: frais.apprentissage,
        confirmations: frais.confirmations,
        nowMs: d.getTime(),
        minute,
        reason: raison,
        attemptsBefore: tentativesRecentes(confirmeA),
        sleptHours: coucher !== null && lever !== null ? ((lever - coucher + 1440) % 1440) / 60 : null,
        coucher,
        tache: tache ? { id: tache.id, deadline: dernierJourDe(tache.echeance) } : null,
        planApres,
        pliage: pliage(o),
      })
      if (!r) return { etape: 'rien' as const }
      if (r.etape === 'pas-de-place') {
        await poser({ apprentissage: r.learning, confirmations: r.confirmations })
        await blocage().pauser(o.blockId, r.confirmations.pause!.endMinute)
        return { etape: 'message' as const, message: r.message }
      }
      return { etape: 'reaction' as const, lignes: r.reaction.lignes, dixMinutes: r.reaction.dixMinutes, attenteMinutes: r.attenteMinutes }
    },

    /**
     * « Oui, j'arrête » : l'attente commence. Le bouclier tient jusqu'au bout
     * de l'attente — iOS le lève lui-même, même app fermée — puis la séance
     * s'arrête au tic suivant.
     */
    confirmerStop: async (raison: StopReason, texte?: string, reponseMs?: number) => {
      const frais = useSeances.getState()
      const o = frais.confirmations.observedPending
      if (!o) return false
      const { d, minute } = maintenantMinute()
      const tache = tacheEnCours(o)
      const prep = preparerStop({
        learning: frais.apprentissage,
        confirmations: frais.confirmations,
        nowMs: d.getTime(),
        minute,
        reason: raison,
        attemptsBefore: tentativesRecentes(frais.confirmations.confirmedAt[o.blockId]),
        sleptHours: coucher !== null && lever !== null ? ((lever - coucher + 1440) % 1440) / 60 : null,
        coucher,
        tache: tache ? { id: tache.id, deadline: dernierJourDe(tache.echeance) } : null,
        planApres,
        pliage: pliage(o),
      })
      if (!prep || prep.etape !== 'reaction') return false
      const c = demanderStop(frais.confirmations, {
        nowMs: d.getTime(),
        minute,
        reason: raison,
        ...(texte ? { text: texte } : {}),
        ...(reponseMs !== undefined ? { answerMs: reponseMs } : {}),
        attemptsBefore: tentativesRecentes(frais.confirmations.confirmedAt[o.blockId]),
        attenteMinutes: prep.attenteMinutes,
        placement: prep.reaction.placement,
      })
      if (!c) return false
      await poser({ apprentissage: frais.apprentissage, confirmations: c })
      const plage = blocage().plagesActives.find((p) => p.blocId === o.blockId)
      // Le reste du créneau du bloc arrêté est libre : un autre bloc qui viendrait
      // s'y glisser ne se bloque pas aussitôt.
      await blocage().suspendre(o.endMinute)
      if (plage) await blocage().remplacerPlage(o.blockId, { ...plage, finMinute: Math.max(plage.debutMinute + 1, c.stopPending!.untilMinute) })
      return true
    },

    /** « Je continue » : l'attente s'annule, le bouclier retrouve la fin du bloc. */
    continuer: async () => {
      const frais = useSeances.getState()
      const r = continuer(frais.apprentissage, frais.confirmations)
      await poser({ apprentissage: r.learning, confirmations: r.confirmations })
      const o = r.confirmations.observedPending
      const plage = o ? blocage().plagesActives.find((p) => p.blocId === o.blockId) : undefined
      if (o && plage && frais.confirmations.stopPending) {
        // On continue finalement : plus rien à suspendre.
        await blocage().suspendre(0)
        await blocage().remplacerPlage(o.blockId, { ...plage, finMinute: o.endMinute })
      }
    },

    /** « 10 more minutes » : on continue, « Stop ? » revient dans 10 min. */
    dixMinutesDePlus: async (raison: StopReason, texte?: string) => {
      const frais = useSeances.getState()
      const r = accorderDixMinutes(frais.apprentissage, frais.confirmations, { nowMs: Date.now(), reason: raison, ...(texte ? { text: texte } : {}) })
      if (!r) return confiance.continuer()
      await poser({ apprentissage: r.learning, confirmations: r.confirmations })
    },

    /** Le rattrapage choisi parmi ceux proposés : la promesse. */
    choisirRattrapage: async (option: OptionRattrapage) => {
      const frais = useSeances.getState()
      const r = choisirRattrapage(frais.apprentissage, frais.confirmations, option, Date.now())
      if (r) await poser({ apprentissage: r.learning, confirmations: r.confirmations })
    },

    /** L'urgence : jusqu'à quand on peut repousser (heures tenables seulement). */
    optionsUrgence: () => {
      const frais = useSeances.getState()
      const o = frais.confirmations.observedPending
      const { d, minute } = maintenantMinute()
      return optionsUrgence({
        learning: frais.apprentissage,
        confirmations: frais.confirmations,
        nowMs: d.getTime(),
        minute,
        deadline: tacheEnCours(o) ? dernierJourDe(tacheEnCours(o)!.echeance) : null,
        planApres,
      })
    },

    /** L'urgence prise : repoussé à `option`, tout écarté sauf `nbApps` apps (3 au plus). */
    reporterEnUrgence: async (option: OptionRattrapage, minutes: number, nbApps: number) => {
      const frais = useSeances.getState()
      const o = frais.confirmations.observedPending
      if (!o) return false
      const { d, minute } = maintenantMinute()
      const r = reporterEnUrgence({
        learning: frais.apprentissage,
        confirmations: frais.confirmations,
        nowMs: d.getTime(),
        minute,
        option,
        minutes,
        apps: [],
        appCount: nbApps,
        label: blocsDuJour.find((b) => b.id === o.blockId)?.label ?? '',
        coucher,
      })
      if (!r) return false
      await poser({ apprentissage: r.learning, confirmations: r.confirmations })
      const selectionId = blocage().selection?.identifiant
      await blocage().remplacerPlage(o.blockId, null)
      if (selectionId && r.confirmations.urgence!.untilMinute > minute) {
        await blocage().remplacerPlage(`urgence-${o.blockId}`, {
          blocId: `urgence-${o.blockId}`,
          debutMinute: minute,
          finMinute: r.confirmations.urgence!.untilMinute,
          selectionId,
          ...(nbApps > 0 ? { exceptionId: IDENTIFIANT_URGENCE } : {}),
        })
      }
      return true
    },

    /** Pas la place de repousser une urgence (ou dans une promesse) : 15 min, puis on finit. */
    urgenceCourte: async (nbApps: number) => {
      const frais = useSeances.getState()
      const o = frais.confirmations.observedPending
      if (!o) return false
      const { d, minute } = maintenantMinute()
      const r = ouvrirUrgence(frais.apprentissage, frais.confirmations, { nowMinute: minute, nowMs: d.getTime(), apps: [], appCount: nbApps, limiteMinute: limite })
      if (!r) return false
      await poser({ apprentissage: r.learning, confirmations: r.confirmations })
      await blocage().pauser(o.blockId, r.confirmations.pause!.endMinute, nbApps > 0 ? IDENTIFIANT_URGENCE : null)
      return true
    },

    /** « J'ai besoin de 15 min », une fois par promesse : avant, la séance glisse ; pendant, une pause. */
    souffle: async (blockId?: string) => {
      const frais = useSeances.getState()
      const { d, minute } = maintenantMinute()
      if (blockId) {
        const p = promesseDuBloc(frais.apprentissage, blockId)
        const l = p ? souffleAvant(frais.apprentissage, p.id) : null
        if (l) await poser({ apprentissage: l, confirmations: frais.confirmations })
        return
      }
      const r = prendreSouffle(frais.apprentissage, frais.confirmations, minute, d.getTime(), limite)
      if (!r) return
      await poser({ apprentissage: r.learning, confirmations: r.confirmations })
      await blocage().pauser(r.confirmations.pause!.blockId, r.confirmations.pause!.endMinute)
    },

    /** « Je reprends » : la pause se termine, le bouclier revient. */
    reprendre: async () => {
      const frais = useSeances.getState()
      const { d, minute } = maintenantMinute()
      const c = frais.confirmations
      let suite: { learning: typeof apprentissage; confirmations: typeof confirmations }
      if (c.awaitingReturn) suite = retourDuSouffle(frais.apprentissage, c, minute, limite)
      else if (c.pause?.kind === 'emergency') suite = finUrgence(frais.apprentissage, c, { nowMinute: minute, nowMs: d.getTime(), end: 'voluntary' })
      else if (c.pause) suite = { learning: frais.apprentissage, confirmations: fermerPause(c, minute) }
      else return
      await poser({ apprentissage: suite.learning, confirmations: suite.confirmations })
      const id = c.pause?.blockId ?? c.awaitingReturn?.blockId
      if (id) await blocage().reprendre(id, minute)
    },
  }

  return {
    ...calcul,
    /**
     * Une séance n'est pas finie : commencée, en pause, en souffle, en attente
     * de Stop ou de rattrapage. Tant que c'est vrai, on ne quitte pas son compte.
     */
    seanceEnCours:
      !!actif ||
      !!confiance.pause ||
      !!confiance.retourAttendu ||
      !!confiance.stopEnAttente ||
      !!confiance.choixRattrapage ||
      !!confiance.urgence,
    /**
     * Les reports avant de commencer (`@shared/planning/report`). Chacun
     * montre d'abord ce que demain devient — le travail ne disparaît jamais.
     */
    reports: {
      /** « Later » : permis pour ce bloc ? (une fois par séance, jamais pour une ancre) */
      plusTardPermis: (bloc: { id: string; kind: string }) =>
        plusTardPermis(apprentissage, { id: bloc.id, kind: bloc.kind as 'task' | 'objective' | 'ancre' }),
      /**
       * « Later » se demande comme un Stop : la raison est donnée, et voici la
       * réaction propre à la raison, puis les heures choisies selon elle —
       * chacune avec ce que demain devient — et, en dernier recours seulement,
       * « Tomorrow ». Une détresse lue dans le texte : on lève tout et on
       * oriente vers une aide humaine.
       */
      reagir: async (bloc: BlocReportable, raison: StopReason, texte?: string): Promise<ReactionPlusTard> => {
        // (Le texte est obligatoire : sans lui, la réaction s'affiche, mais aucune heure.)
        const frais = useSeances.getState()
        const { d, minute } = maintenantMinute()
        if (texte && detecteDetresse(texte)) {
          await poser({
            apprentissage: { ...frais.apprentissage, lastSignalAt: { ...frais.apprentissage.lastSignalAt, [SUJET_DETRESSE]: d.toISOString() } },
            confirmations: frais.confirmations,
          })
          await blocage().remplacerPlage(bloc.id, null)
          return { etape: 'message', message: MESSAGE_AIDE }
        }
        const aujourdHui = cleDate(d)
        const demain = ajouterJours(aujourdHui, 1)
        const avant = planApres(frais.apprentissage, frais.confirmations)
        const tache = tacheEnCours(bloc)
        const reaction = reactionRaison(
          raison,
          {
            heldMinutes: 0,
            plannedMinutes: bloc.workMinutes,
            attemptsBefore: tentativesRecentes(undefined),
            kind: bloc.kind as 'task' | 'objective',
            nowMinute: minute,
            sleptHours: coucher !== null && lever !== null ? ((lever - coucher + 1440) % 1440) / 60 : null,
          },
          { niveau, echeance: tache ? echeanceDe(avant.plan, aujourdHui, { id: tache.id, deadline: dernierJourDe(tache.echeance) }) : null },
        )
        if (!texteSuffisant(texte)) {
          return { etape: 'reaction', lignes: reaction.lignes, dixMinutes: reaction.dixMinutes, sansTexte: true, options: [], journee: null }
        }
        const placement = reaction.placement
        const options = optionsPlusTard({
          plan: avant.plan, today: aujourdHui, nowMinute: minute,
          bloc: { kind: bloc.kind as 'task' | 'objective', refId: bloc.refId, workMinutes: empreinteRattrapage(bloc.workMinutes, placement.morceau) },
          deadline: tache ? dernierJourDe(tache.echeance) : null,
          preference: placement.preference,
        }).map((o) => ({
          ...o,
          placement,
          demainMinutes: travailDuJour(planApres(reporterPlusTard(frais.apprentissage, bloc, o, aujourdHui, raison, placement), frais.confirmations).plan, demain),
        }))
        // « Tomorrow », en dernier recours : permis cette semaine, et seulement si tout tient encore.
        const apres = planApres(noterReport(frais.apprentissage, { date: aujourdHui, kind: 'day' }), frais.confirmations)
        const refs = avant.plan.blocks
          .filter((x) => x.date === aujourdHui && (x.kind === 'task' || x.kind === 'objective'))
          .map((x) => ({ kind: x.kind as 'task' | 'objective', refId: x.refId }))
        const journee =
          reportJourneePermis(frais.apprentissage, aujourdHui) && journeeReportable({ planApres: apres.plan, inputApres: apres.input, refs })
            ? { aujourdhuiMinutes: travailDuJour(avant.plan, aujourdHui), demainAvant: travailDuJour(avant.plan, demain), demainApres: travailDuJour(apres.plan, demain) }
            : null
        return { etape: 'reaction', lignes: reaction.lignes, dixMinutes: reaction.dixMinutes, sansTexte: false, options, journee }
      },
      /** « Ennuyeux » : 10 minutes d'abord, puis la question revient (comme « 10 more minutes » d'un Stop). */
      dixMinutes: (raison: StopReason, texte?: string) => confiance.dixMinutesDePlus(raison, texte),
      /** Repose la séance à l'heure choisie ; l'écart et les rappels de maintenant s'arrêtent. */
      choisirPlusTard: async (bloc: BlocReportable & { startMinute: number }, option: OptionPlusTardVue, raison: StopReason, texte: string, reponseMs?: number) => {
        const frais = useSeances.getState()
        const aujourdHui = cleDate(new Date())
        const trace = traceDuReport(bloc, aujourdHui, raison, texte, reponseMs)
        // Le bloc reporté n'est plus suivi : sans ça, sa fenêtre d'origine se
        // fermerait plus tard et compterait comme une séance ratée.
        const c = frais.confirmations
        const confirmations = c.observedPending?.blockId === bloc.id ? { ...c, observedPending: null } : c
        const l = reporterPlusTard(frais.apprentissage, bloc, option, aujourdHui, raison, option.placement)
        await poser({ apprentissage: { ...l, sessionEvents: [...(l.sessionEvents ?? []), trace].slice(-3000) }, confirmations })
        // Libre jusqu'à l'heure choisie (aujourd'hui), ou jusqu'à la fin du bloc reporté à demain.
        await blocage().suspendre(option.date === aujourdHui ? option.startMinute : bloc.startMinute + bloc.workMinutes)
        await blocage().remplacerPlage(bloc.id, null)
      },
      /** « Tomorrow » : tout ce qui reste aujourd'hui passe aux jours suivants. */
      reporterJournee: async (bloc: BlocReportable & { startMinute: number }, raison: StopReason, texte: string, reponseMs?: number) => {
        const frais = useSeances.getState()
        const aujourdHui = cleDate(new Date())
        const trace = traceDuReport(bloc, aujourdHui, raison, texte, reponseMs)
        const c = frais.confirmations
        const enCours = c.observedPending && c.observedPending.blockId in c.confirmedAt
        const confirmations = c.observedPending && !enCours ? { ...c, observedPending: null } : c
        const l = noterReport(frais.apprentissage, { date: aujourdHui, kind: 'day', reason: raison })
        await poser({ apprentissage: { ...l, sessionEvents: [...(l.sessionEvents ?? []), trace].slice(-3000) }, confirmations })
        // Toute la journée est reportée : plus rien d'automatique ne bloque aujourd'hui.
        await blocage().suspendre(1440)
        const plages = blocage().plagesActives.filter((p) => !blocsDuJour.some((x) => x.id === p.blocId && !(x.id in frais.confirmations.confirmedAt)))
        await blocage().appliquerPlan(plages)
      },
    },
    /**
     * Le juge d'un Stop ou d'un Later (`@shared/coach/arbitre`) : 2 à 5
     * questions, puis accepté ou refusé. Sans accord pour l'IA, hors ligne ou
     * sans réponse : les règles fixes.
     */
    justification: {
      /** Déjà refusé pour ce bloc : pas de seconde demande pendant la même séance. */
      refusePour: (blockId: string) => (apprentissage.justifications ?? []).some((j) => j.blockId === blockId && j.verdict === 'refuse'),
      /** L'accord pour l'IA : 'oui', 'non', ou null (pas encore demandé). */
      consentement: reglages.consentementIA ?? null,
      consentir: (oui: boolean) => majReglages({ consentementIA: oui ? 'oui' : 'non' }),
      /** Le bloc concerné : celui qui attend « Je commence » (Later), ou la séance en cours (Stop). */
      blocDe: (sorte: 'stop' | 'later', attente?: BlocReportable & { startMinute: number }) => {
        if (sorte === 'later') return attente ?? null
        const o = useSeances.getState().confirmations.observedPending
        if (!o) return null
        const b = calcul.resultat.blocks.find((x) => x.id === o.blockId)
        return { id: o.blockId, kind: o.kind, refId: o.refId, label: b?.label ?? '', startMinute: o.startMinute, workMinutes: o.workMinutes ?? o.endMinute - o.startMinute }
      },
      juger: async (a: {
        sorte: 'stop' | 'later'
        bloc: BlocReportable & { startMinute: number }
        raison: StopReason
        texte: string
        echanges: { question: string; sig: string; reponse: string }[]
      }): Promise<ReponseArbitre> => {
        if (reglages.consentementIA !== 'oui') return { action: 'indecis' }
        if (a.bloc.kind !== 'task' && a.bloc.kind !== 'objective') return { action: 'indecis' }
        const frais = useSeances.getState()
        const aujourdHui = cleDate(new Date())
        const confirmeA = frais.confirmations.confirmedAt[a.bloc.id]
        const tache = tacheEnCours(a.bloc)
        return coach().arbitrer({
          sorte: a.sorte,
          raison: a.raison,
          texte: a.texte.slice(0, 500),
          echanges: a.echanges,
          confiance: niveau,
          faits: {
            titre: a.bloc.label.slice(0, 80),
            nature: a.bloc.kind,
            heure: `${String(Math.floor(a.bloc.startMinute / 60) % 24).padStart(2, '0')}:${String(a.bloc.startMinute % 60).padStart(2, '0')}`,
            minutesPrevues: Math.max(0, Math.min(1440, a.bloc.workMinutes)),
            minutesTenues: a.sorte === 'stop' && confirmeA ? Math.max(0, Math.min(1440, Math.round((Date.now() - confirmeA) / 60_000))) : 0,
            tentativesApps: Math.min(500, tentativesRecentes(confirmeA)),
            echeanceJours: tache ? Math.max(0, daysBetween(aujourdHui, tache.echeance)) : null,
          },
          historique: historiquePourJuge(frais.apprentissage, aujourdHui),
        })
      },
      /** Les règles fixes : quelques mots ET une confiance d'au moins 2. */
      regles: (texte: string) => reglesFixes({ texte, niveau }),
      /**
       * La décision est rendue : elle entre au journal des justifications (le
       * juge la relira), une incohérence citée fait baisser la confiance, et
       * pendant une séance le temps passé à se justifier ne compte pas.
       */
      conclure: async (a: {
        sorte: 'stop' | 'later'
        bloc: BlocReportable & { startMinute: number }
        raison: StopReason
        texte: string
        reponses: string[]
        verdict: 'accepte' | 'refuse'
        incoherence: boolean
        regles: boolean
        depuisMs: number
      }) => {
        const frais = useSeances.getState()
        const aujourdHui = cleDate(new Date())
        let c = frais.confirmations
        if (a.sorte === 'stop' && a.bloc.id in c.confirmedAt) {
          const debut = new Date(a.depuisMs)
          const fin = new Date()
          c = exclureDuTravail(c, debut.getHours() * 60 + debut.getMinutes(), fin.getHours() * 60 + fin.getMinutes() + 1)
        }
        await poser({
          apprentissage: noterJustification(frais.apprentissage, {
            date: aujourdHui,
            sorte: a.sorte,
            blockId: a.bloc.id,
            reason: a.raison,
            text: a.texte.slice(0, 500),
            answers: a.reponses.map((r) => r.slice(0, 500)).slice(0, 5),
            verdict: a.verdict,
            incoherence: a.incoherence,
            rules: a.regles,
          }),
          confirmations: c,
        })
      },
    },
    /** Les séances faites un jour passé, relues du journal. */
    tenuesDu: (date: string) => seancesTenues(apprentissage.sessionEvents ?? [], date, titreDe),
    confiance,
    /** Prolongation proposée pour la séance en cours (minutes), ou null. */
    prolongation: prolongationMontree?.minutes ?? null,
    /** La séance est dans sa prolongation : « Stop » y est simplement la fin. */
    enProlongation: !!actif && dansLaProlongation(evenementActif, actif.startMinute, calcul.minute),
    /** « Oui » : la séance s'allonge, le bouclier aussi. */
    prolonger: async () => {
      if (!prolongationMontree) return
      const frais = useSeances.getState()
      const o = frais.confirmations.observedPending
      if (!o) return
      const finTravail = o.startMinute + (o.workMinutes ?? o.endMinute - o.startMinute) + prolongationMontree.minutes
      const r = accepterProlongation({
        learning: frais.apprentissage,
        confirmations: frais.confirmations,
        minutes: prolongationMontree.minutes,
        prochainDebut: prochainDebut(finTravail - prolongationMontree.minutes),
      })
      setOffreVisible(null)
      if (!r) return
      await poser({ apprentissage: r.learning, confirmations: r.confirmations })
      const blocage = useBlocage.getState()
      const plage = blocage.plagesActives.find((p) => p.blocId === o.blockId)
      const fin = r.confirmations.observedPending?.endMinute
      if (plage && fin) await blocage.ouvrirSeance({ ...plage, finMinute: Math.max(plage.finMinute, fin) }, { theme, titreBloc: blocage.titreSeance ?? '' })
    },
    /** « Non, j'arrête là » : jamais un échec, jamais un signal négatif. */
    declinerProlongation: () => setOffreVisible(null),
    /** Le jour libre proposable cette semaine (YYYY-MM-DD), ou null. */
    jourLibre,
    decideJourLibre: async (date: string, decision: 'taken' | 'kept') => {
      const frais = useSeances.getState()
      await poser({
        apprentissage: { ...frais.apprentissage, freeDays: { ...frais.apprentissage.freeDays, [date]: decision } },
        confirmations: frais.confirmations,
      })
    },
    /** D.8 : le bloc qui attend son « Je commence » PAR L'OVERLAY. Au plus un à la fois. */
    enAttente: overlayDu ? enAttenteBrut : null,
    /** Le bloc démarrable sans overlay (phases 3-4) : le raccourci de Today. */
    demarrable: overlayDu ? null : enAttenteBrut,
    /**
     * « Stop » : arrête la séance en cours ici, avec sa raison (un tap). Le
     * travail est crédité jusqu'à cette minute et le bouclier se lève.
     */
    arreter: async (raison: StopReason | null, texte?: string, reponseMs?: number) => {
      // L'état FRAIS du magasin, jamais celui du rendu : un crédit que le tic
      // vient d'écrire ne doit pas être écrasé par un instantané périmé.
      const frais = useSeances.getState()
      const maintenantStop = new Date()
      const confirmeA = frais.confirmations.observedPending
        ? frais.confirmations.confirmedAt[frais.confirmations.observedPending.blockId]
        : undefined
      const r = arreter({
        maintenant: maintenantStop,
        touche: new Date(maintenantStop.getTime() - Math.min(reponseMs ?? 0, 30 * 60_000)),
        etat: { apprentissage: frais.apprentissage, confirmations: frais.confirmations },
        raison,
        ...(texte !== undefined ? { texte } : {}),
        ...(reponseMs !== undefined ? { reponseMs } : {}),
        tentativesAvant: pontEcran()
          .lireTentatives()
          .filter((t) => Date.now() - t < 10 * 60_000 && (confirmeA === undefined || t >= confirmeA)).length,
        raisonTexte: texte ? lireTexteArret(texte) : null,
      })
      if (!r) return { ok: false as const }
      const blocId = frais.confirmations.observedPending?.blockId
      await poser({ apprentissage: r.apprentissage, confirmations: r.confirmations })
      const blocage = useBlocage.getState()
      if (blocId && blocage.plagesActives.some((p) => p.blocId === blocId)) {
        await blocage.appliquerPlan(blocage.plagesActives.filter((p) => p.blocId !== blocId))
      }
      // Le texte d'un arrêt RESTE sur l'appareil (principe : données locales) :
      // il n'est lu que par les mots-clés, jamais envoyé au Coach.
      // Une détresse s'y lit AVANT tout : on sort du mode discipline 24 h.
      if (texte && detecteDetresse(texte)) {
        const e = useSeances.getState()
        await e.poser({
          apprentissage: {
            ...e.apprentissage,
            lastSignalAt: { ...e.apprentissage.lastSignalAt, [SUJET_DETRESSE]: new Date().toISOString() },
          },
          confirmations: e.confirmations,
        })
        return { ok: true as const, aide: MESSAGE_AIDE }
      }
      return { ok: true as const }
    },
    /** D.7 : ouvre une séance. Le retard se mesure à cet instant précis. */
    confirmer: async (bloc: NonNullable<ReturnType<typeof tictac>['enAttente']>, quand?: Date) => {
      // `quand` : « I'm starting » touché sur une notification, un peu plus tôt.
      const instant = quand ?? new Date()
      const minute = instant.getHours() * 60 + instant.getMinutes()
      const contexte = journalContextFor({
        learning: apprentissage,
        today: calcul.aujourdHui,
        yesterday: addDays(calcul.aujourdHui, -1),
        nowMinute: minute,
        wakeMinute: minutesDe(reglages.lever),
        // Démarré avant que l'overlay ne le demande : un démarrage spontané.
        spontaneous: !overlayDueFor({ learning: apprentissage, block: bloc, nowMinute: minute, today: calcul.aujourdHui }),
      })
      const suivant = confirmer({ maintenant: instant, bloc, etat: { apprentissage, confirmations }, contexte })
      if (suivant.refuse) return { ok: false as const, raison: suivant.refuse }
      await poser({ apprentissage: suivant.apprentissage, confirmations: suivant.confirmations })

      // D.8 : le bouclier se leve MAINTENANT, et pour la duree de la tache.
      // Il n'existe aucune session de blocage autonome — sans ce geste-ci,
      // rien ne se leve jamais. La mesure est deja rangee au-dessus : si le
      // blocage echoue (autorisation retiree, selection absente), la seance
      // reste ouverte et comptee. Perdre la mesure parce qu'iOS a dit non
      // serait punir deux fois.
      const blocage = useBlocage.getState()
      const selectionId = blocage.selection?.identifiant
      if (selectionId) {
        const plage = plageDeSeance({ bloc, confirmeAMs: instant.getTime(), selectionId })
        // Le titre du bloc voyage jusqu'au bouclier : c'est la seule chose
        // qu'on ait a dire a quelqu'un qui vient d'ouvrir une application
        // ecartee. « Chemistry — until 15:30 » parle du plan ; « Blocked »
        // parlerait de lui.
        // « Distracted » : le rattrapage se fait en mode profond, tout écarté sauf la liste gardée.
        const profond = promesseDuBloc(apprentissage, bloc.id)?.deep === true
        if (plage) await blocage.ouvrirSeance(profond ? { ...plage, profond: true } : plage, { theme, titreBloc: bloc.label })
      }

      return { ok: true as const, retardMinutes: suivant.retardMinutes }
    },
  }
}

const ContextePlan = createContext<ReturnType<typeof useSourcePlan> | null>(null)
export function FournisseurPlan({ children }: { children: ReactNode }) {
  const valeur = useSourcePlan()
  return <ContextePlan.Provider value={valeur}>{children}</ContextePlan.Provider>
}
export function usePlan() {
  const valeur = useContext(ContextePlan)
  if (!valeur) throw new Error('FournisseurPlan absent')
  return valeur
}
