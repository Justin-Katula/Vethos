import { describe, it, expect, vi } from 'vitest'
import { analyzeTaskClarity, generateSubTasks, mergeCoachAppReferences } from './coach.service'
import { sendDeepSeekChat } from '@main/deepseek/gateway'

vi.mock('@main/deepseek/gateway', () => ({
  sendDeepSeekChat: vi.fn(),
}))

describe('CoachService', () => {
  it('analyzeTaskClarity returns clear true when deepseek says so', async () => {
    vi.mocked(sendDeepSeekChat).mockResolvedValueOnce({
      id: '1',
      model: 'model',
      content: '{ "clear": true }',
    })

    const res = await analyzeTaskClarity('Résoudre 5 équations du second degré')
    expect(res.data).toEqual({ clear: true, suggestedQuestion: undefined })
    expect(res.safety.fallbackUsed).toBe(false)
  })

  it('analyzeTaskClarity returns clear false and suggestedQuestion', async () => {
    vi.mocked(sendDeepSeekChat).mockResolvedValueOnce({
      id: '2',
      model: 'model',
      content: '{ "clear": false, "suggestedQuestion": "Quel chapitre ?" }',
    })

    const res = await analyzeTaskClarity('Maths')
    expect(res.data).toEqual({ clear: false, suggestedQuestion: 'Quel chapitre ?' })
    expect(res.reasons.length).toBeGreaterThan(0)
  })

  it('generateSubTasks returns parsed subtasks list', async () => {
    vi.mocked(sendDeepSeekChat).mockResolvedValueOnce({
      id: '3',
      model: 'model',
      content: '[{ "title": "Lecture", "durationMinutes": 20 }, { "title": "Exercices", "durationMinutes": 40 }]',
    })

    const res = await generateSubTasks('Maths', 'Notes', 60)
    expect(res.data).toHaveLength(2)
    expect(res.data[0]).toEqual({ title: 'Lecture', durationMinutes: 20 })
    expect(res.data[1]).toEqual({ title: 'Exercices', durationMinutes: 40 })
  })

  it('mergeCoachAppReferences keeps known registry entries and adds scanned apps', () => {
    const res = mergeCoachAppReferences(
      [
        { identifier: 'youtube.com', displayName: 'YouTube' },
        { identifier: 'code.exe', displayName: 'VS Code' },
      ],
      [
        { exeName: 'Code.exe', name: 'Visual Studio Code' },
        { exeName: 'Discord.exe', name: 'Discord' },
        { exeName: 'unknown.exe', name: 'Unknown app' },
      ],
    )

    expect(res).toEqual([
      { identifier: 'youtube.com', displayName: 'YouTube' },
      { identifier: 'code.exe', displayName: 'VS Code' },
      { identifier: 'Discord.exe', displayName: 'Discord' },
    ])
  })
})
