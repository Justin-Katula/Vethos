import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { useDonnees } from '@/donnees/magasin'
import { useSeances } from '@/seances/magasin-seances'
import { useBlocage } from '@/blocage/etat'
import { plageDeSeance } from '@/blocage/pont-seance'
import { arreter, confirmer, seanceActive, tictac } from '@/seances/pendule'
import { journalContextFor, overlayDueFor, setBlockedAttempts } from '@shared/planning/clock'
import { lireTexteArret } from '@shared/coach/coach'
import { dueRemovals } from '@shared/contract'
import { detecteDetresse, disciplineSuspendue, MESSAGE_AIDE, SUJET_DETRESSE } from '@shared/coach/garde-fous'
import { pontEcran } from '@/blocage/ecran-natif'
import { addDays } from '@shared/planning/dates'
import type { StopReason } from '@shared/schemas'
import { minutesDe } from '@/donnees/regle-sommeil'
import { useNomTheme } from '@/theme/Theme'
import { calculerPlan, cleDate } from './moteur'
import { lireSemaine } from './lecture'

function useSourcePlan() {
  const { taches, objectifs, ancres, obligations, reglages, chargees, terminerTaches, supprimerObjectif, majReglages } = useDonnees()
  const { apprentissage, confirmations, chargees: mesuresPretes, charger, poser } = useSeances()
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

  const calcul = useMemo(() => {
    const maintenant = new Date(instant)
    const aujourdHui = cleDate(maintenant)
    const minute = maintenant.getHours() * 60 + maintenant.getMinutes()

    // D.7 : la séance confirmée en cours est lue AVANT le calcul et entre
    // dedans. Elle se produit déjà, donc elle ne se replace pas — sans quoi
    // chaque recalcul la repousserait d'une minute vers l'avant, indéfiniment.
    const active = seanceActive(confirmations, aujourdHui, minute)

    const resultat = calculerPlan({
      taches, objectifs, ancres, obligations, reglages, maintenant,
      apprentissage, seanceActive: active,
    })
    const jours = lireSemaine(resultat, obligations, reglages)
    return { resultat, jours, maintenant, aujourdHui, minute,
      chargees: chargees && mesuresPretes, seanceActive: active }
  }, [taches, objectifs, ancres, obligations, reglages, instant, chargees,
      apprentissage, confirmations, mesuresPretes])

  // Les aperçus sont écartés UNE FOIS, ici : une partie encore verrouillée
  // (B.5.1) ne se confirme pas, ne bloque rien et ne crédite aucun travail.
  // En oublier un seul endroit rouvrirait la porte à une confirmation sur une
  // partie qui n'a pas encore le droit de commencer.
  const blocsDuJour = useMemo(
    () => calcul.resultat.blocks.filter((b) => b.date === calcul.aujourdHui && b.preview !== true),
    [calcul.resultat, calcul.aujourdHui],
  )

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
    [mesuresPretes, chargees, calcul.maintenant, calcul.aujourdHui, blocsDuJour, taches,
     apprentissage, confirmations],
  )

  useEffect(() => { void charger(cleDate(new Date())) }, [charger])

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
  useEffect(() => {
    if (!tic) return
    const empreinte = `${calcul.aujourdHui}|${calcul.minute}`
    if (dernierTic.current === empreinte) return
    dernierTic.current = empreinte
    // Les tentatives d'ouvrir une app écartée, relues depuis l'extension du
    // bouclier : leur nombre depuis le « Je commence » de la séance en cours.
    let appris = tic.apprentissage
    const o = tic.confirmations.observedPending
    const confirmeA = o ? tic.confirmations.confirmedAt[o.blockId] : undefined
    if (confirmeA !== undefined) {
      const n = pontEcran().lireTentatives().filter((t) => t >= confirmeA && t <= Date.now()).length
      appris = setBlockedAttempts(appris, tic.confirmations, n)
    }
    if (tic.change || appris !== tic.apprentissage) void poser({ apprentissage: appris, confirmations: tic.confirmations })
    if (tic.terminees.length > 0) void terminerTaches(tic.terminees)
  }, [tic, calcul.aujourdHui, calcul.minute, poser, terminerTaches])

  // Retrait progressif : le bloc en attente n'appelle l'overlay que si sa
  // phase le demande (phase 3 : 10 min après, jamais un jour-test ; phase 4 :
  // jamais). Sinon il reste démarrable d'un geste, depuis Today.
  const enAttenteBrut = tic?.enAttente ?? null
  // Détresse vue il y a moins de 24 h : plus d'overlay, plus d'exigence.
  const suspendu = disciplineSuspendue(apprentissage.lastSignalAt, calcul.maintenant)
  const overlayDu =
    !suspendu &&
    enAttenteBrut !== null &&
    overlayDueFor({ learning: apprentissage, block: enAttenteBrut, nowMinute: calcul.minute, today: calcul.aujourdHui })

  return {
    ...calcul,
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
    confirmer: async (bloc: NonNullable<ReturnType<typeof tictac>['enAttente']>) => {
      const instant = new Date()
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
        if (plage) await blocage.ouvrirSeance(plage, { theme, titreBloc: bloc.label })
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
