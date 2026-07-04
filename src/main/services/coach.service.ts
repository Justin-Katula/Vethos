import { sendDeepSeekChat } from '@main/deepseek/gateway'
import log from '../logging/setup'
import { coachFallback, coachSuccess, type CoachResult } from '@shared/coach-result'

export type CoachAppReference = {
  identifier: string
  displayName: string
}

export type CoachInstalledAppReference = {
  name: string
  exeName: string
}

export function mergeCoachAppReferences(
  providedApps: CoachAppReference[],
  installedApps: CoachInstalledAppReference[],
): CoachAppReference[] {
  const seen = new Set<string>()
  const merged: CoachAppReference[] = []

  function add(identifier: string, displayName: string): void {
    const cleanIdentifier = identifier.trim()
    if (!cleanIdentifier) return
    const key = cleanIdentifier.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    merged.push({
      identifier: cleanIdentifier,
      displayName: displayName.trim() || cleanIdentifier,
    })
  }

  for (const app of providedApps) {
    add(app.identifier, app.displayName)
  }

  for (const app of installedApps) {
    if (!app.exeName || app.exeName.toLowerCase() === 'unknown.exe') continue
    add(app.exeName, app.name)
  }

  return merged
}

export async function analyzeTaskClarity(
  taskTitle: string,
): Promise<CoachResult<{ clear: boolean; suggestedQuestion?: string }>> {
  try {
    const prompt = `Analyze the following task title from a productivity app user: "${taskTitle}".
Is it clear and specific enough to be immediately actioned, or is it vague/ambiguous (e.g. "Maths", "Work", "Study", "Read")?
Return ONLY a JSON object with two fields:
- "clear": boolean (true if specific and action-oriented, false if vague or ambiguous)
- "suggestedQuestion": string (if clear is false, suggest a short, friendly context-appropriate question in French to ask the user to clarify their specific goal for this session. Otherwise, omit this field).

Example vague task: "Maths"
Output: { "clear": false, "suggestedQuestion": "Quel chapitre ou exercice de mathématiques vas-tu travailler aujourd'hui ?" }

Example clear task: "Résoudre 5 équations du second degré"
Output: { "clear": true }`

    const response = await sendDeepSeekChat({
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are Vethos productivity coach. You respond only in valid JSON.' },
        { role: 'user', content: prompt },
      ],
    })

    let jsonText = response.content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7, -3).trim()
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3, -3).trim()
    }

    const parsed = JSON.parse(jsonText)
    return coachSuccess('task_clarity', {
      clear: Boolean(parsed.clear),
      suggestedQuestion:
        typeof parsed.suggestedQuestion === 'string' ? parsed.suggestedQuestion : undefined,
    }, ['Coach a analysé si la tâche est directement actionnable.'])
  } catch (err) {
    log.error('[coach-service] analyzeTaskClarity failed', err)
    return coachFallback('task_clarity', { clear: true }, 'Coach indisponible : repli non bloquant appliqué.')
  }
}

export async function generateSubTasks(
  taskTitle: string,
  contextNotes: string,
  totalMinutes: number,
): Promise<CoachResult<Array<{ title: string; durationMinutes: number }>>> {
  try {
    const prompt = `You are a productivity expert. A user wants to work on the task: "${taskTitle}".
Here are the context notes gathered: "${contextNotes}".
The total duration of the session is ${totalMinutes} minutes.
Divide this session into structured, action-oriented subtasks (focus blocks) of 15 to 40 minutes each.
The sum of durationMinutes of all subtasks MUST be exactly ${totalMinutes} minutes.
Return ONLY a JSON array of objects, where each object has:
- "title": string (specific subtask action, in French)
- "durationMinutes": number (duration in minutes)

Example output:
[
  { "title": "Lire le cours et comprendre les formules", "durationMinutes": 20 },
  { "title": "Résoudre les 5 exercices d'application", "durationMinutes": 40 }
]`

    const response = await sendDeepSeekChat({
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'You are Vethos productivity coach. You respond only in a valid JSON array.',
        },
        { role: 'user', content: prompt },
      ],
    })

    let jsonText = response.content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7, -3).trim()
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3, -3).trim()
    }

    const parsed = JSON.parse(jsonText)
    if (Array.isArray(parsed)) {
      let currentSum = 0
      const subtasks: Array<{ title: string; durationMinutes: number }> = []

      for (const item of parsed) {
        if (typeof item.title === 'string' && typeof item.durationMinutes === 'number') {
          const duration = Math.max(1, Math.round(item.durationMinutes))
          subtasks.push({
            title: item.title,
            durationMinutes: duration,
          })
          currentSum += duration
        }
      }

      // Ajustement pour correspondre exactement à totalMinutes
      if (subtasks.length > 0 && currentSum !== totalMinutes) {
        const diff = totalMinutes - currentSum
        const lastIndex = subtasks.length - 1
        subtasks[lastIndex]!.durationMinutes = Math.max(
          1,
          subtasks[lastIndex]!.durationMinutes + diff,
        )
      }

      return coachSuccess('subtask_plan', subtasks, ['Coach a proposé un découpage dont la durée totale est contrôlée.'])
    }

    return coachFallback('subtask_plan', [], 'Réponse Coach inexploitable : aucun découpage appliqué.')
  } catch (err) {
    log.error('[coach-service] generateSubTasks failed', err)
    return coachFallback('subtask_plan', [], 'Coach indisponible : aucun découpage appliqué.')
  }
}

export async function categorizeApplications(
  apps: Array<{ name: string; exeName: string }>,
): Promise<CoachResult<Record<string, string>>> {
  if (apps.length === 0) return coachSuccess('app_category', {}, ['Aucune application à classer.'], 100)

  try {
    const prompt = `You are an expert in computer applications and productivity.
Categorize each of the following applications into exactly one of these 18 categories:
Social, Communication, Games, Entertainment, Music & Audio, Creativity, Development, AI & Automation, Education, Health & Fitness, Information & Reading, Browsers & Internet, Productivity & Finance, Shopping & Food, Travel, Security, Utilities, Other.

Applications list:
${JSON.stringify(apps.map((a) => ({ name: a.name, key: a.exeName })))}

Return ONLY a JSON object mapping each application's provided key, exactly as received, to its category string. Do not include markdown code block formatting.`

    const response = await sendDeepSeekChat({
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'You are Vethos application classifier. You respond only in valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
    })

    let jsonText = response.content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7, -3).trim()
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3, -3).trim()
    }

    return coachSuccess('app_category', JSON.parse(jsonText) as Record<string, string>, ['Catégories vérifiées par le moteur Coach.'])
  } catch (err) {
    log.error('[coach-service] categorizeApplications failed', err)
    return coachFallback('app_category', {}, 'Coach indisponible : classifications existantes conservées.')
  }
}

export async function classifyRegistryForTask(
  taskTitle: string,
  contextNotes: string,
  apps: CoachAppReference[],
  currentUsefulApps: string[],
): Promise<CoachResult<Record<string, 'useful' | 'distraction' | 'neutral'>>> {
  if (apps.length === 0) return coachSuccess('task_app_relevance', {}, ['Aucune application à classer.'], 100)

  try {
    const prompt = `You are a focus and productivity coach. A user is starting a focus work session.
Active Task: "${taskTitle}"
Context Notes: "${contextNotes}"

Currently, the user or system has previously marked these applications/websites as USEFUL for this task:
${JSON.stringify(currentUsefulApps)}

Please analyze if each of the following applications is useful, a distraction, or neutral for this specific task.
You should build on the current list of useful apps and refine it (adding newly relevant tools or removing ones that are no longer appropriate based on the new context).

Roles:
- "useful": Directly needed or highly related to doing this task (e.g. coding tools for development, writing tools for essays).
- "distraction": Leisure, games, messaging, or social media apps that will divert attention (e.g. Discord, Steam, Spotify, YouTube).
- "neutral": General utility tools or harmless system processes (e.g. file explorer, calculator) which are not specifically useful but don't need to be blocked.

Applications list to evaluate:
${JSON.stringify(apps.map((a) => ({ name: a.displayName, exeName: a.identifier })))}

Return ONLY a JSON object mapping each application's executable name (lowercase) to its role string ("useful", "distraction", "neutral"). Do not include markdown formatting.`

    const response = await sendDeepSeekChat({
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are Vethos focus blocker assistant. You respond only in valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
    })

    let jsonText = response.content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7, -3).trim()
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3, -3).trim()
    }

    return coachSuccess('task_app_relevance', JSON.parse(jsonText) as Record<string, 'useful' | 'distraction' | 'neutral'>, ['Pertinence évaluée dans le contexte de la tâche.'])
  } catch (err) {
    log.error('[coach-service] classifyRegistryForTask failed', err)
    return coachFallback('task_app_relevance', {}, 'Coach indisponible : choix utilisateur et registre conservés.')
  }
}

export async function classifyRegistryForObjective(
  objectiveName: string,
  objectiveDescription: string,
  apps: CoachAppReference[],
  currentUsefulApps: string[],
): Promise<CoachResult<Record<string, 'useful' | 'distraction' | 'neutral'>>> {
  if (apps.length === 0) return coachSuccess('objective_app_relevance', {}, ['Aucune application à classer.'], 100)

  try {
    const prompt = `You are a focus and productivity coach. A user has a long-term goal/objective.
Objective Name: "${objectiveName}"
Objective Description: "${objectiveDescription}"

Currently, the user or system has previously marked these applications/websites as USEFUL for this objective:
${JSON.stringify(currentUsefulApps)}

Please analyze if each of the following applications is useful, a distraction, or neutral for this specific objective.
You should build on the current list of useful apps and refine it (adding newly relevant tools or removing ones that are no longer appropriate based on the new context).

Roles:
- "useful": Directly needed or highly related to working towards this objective (e.g. IDEs for programming, design tools for graphic art).
- "distraction": Leisure, games, messaging, or social media apps that will divert attention (e.g. Discord, Steam, Spotify, YouTube).
- "neutral": General utility tools or harmless system processes (e.g. file explorer, calculator) which are not specifically useful but don't need to be blocked.

Applications list to evaluate:
${JSON.stringify(apps.map((a) => ({ name: a.displayName, exeName: a.identifier })))}

Return ONLY a JSON object mapping each application's executable name (lowercase) to its role string ("useful", "distraction", "neutral"). Do not include markdown formatting.`

    const response = await sendDeepSeekChat({
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are Vethos focus blocker assistant. You respond only in valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
    })

    let jsonText = response.content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7, -3).trim()
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3, -3).trim()
    }

    return coachSuccess('objective_app_relevance', JSON.parse(jsonText) as Record<string, 'useful' | 'distraction' | 'neutral'>, ['Pertinence évaluée dans le contexte de l’objectif.'])
  } catch (err) {
    log.error('[coach-service] classifyRegistryForObjective failed', err)
    return coachFallback('objective_app_relevance', {}, 'Coach indisponible : choix utilisateur et registre conservés.')
  }
}
