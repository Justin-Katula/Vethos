import { describe, expect, it } from 'vitest'
import type {
  ExecutionPreviewProviderState,
  ExecutionPreviewRawSnapshot,
  ExecutionPreviewSanitizedSnapshot,
} from '@shared/execution-preview-data-connector-model'
import { runExecutionPreviewDataConnectorDiagnostics } from './execution-preview-data-connector-diagnostics'

function raw(overrides: Partial<ExecutionPreviewRawSnapshot> = {}): ExecutionPreviewRawSnapshot {
  return {
    userId: 'user-1', tasks: [{}], objectives: [{}], schedules: [{}], sessions: [], apps: [], sites: [],
    settings: {}, auth: undefined, sourceReports: [], capturedAt: '2026-07-03T00:00:00.000Z',
    warnings: [], confidence: 100, ...overrides,
  }
}

function sanitized(
  overrides: Partial<ExecutionPreviewSanitizedSnapshot> = {},
): ExecutionPreviewSanitizedSnapshot {
  return {
    userId: 'user-1', tasks: [{}], objectives: [{}], schedules: [{}], sessions: [], apps: [], sites: [],
    settings: {}, dateRange: { startDate: '2026-07-03', endDate: '2026-07-04' }, warnings: [],
    confidence: 100, metadata: { source: 'read_only_store_snapshot', capturedAt: '2026-07-03T00:00:00.000Z', sanitizedAt: '2026-07-03T00:00:00.000Z' },
    ...overrides,
  }
}

function provider(overrides: Partial<ExecutionPreviewProviderState> = {}): ExecutionPreviewProviderState {
  return {
    status: 'ready', warnings: [], errors: [], canGeneratePreview: true,
    canApplyPreview: false, confidence: 100, ...overrides,
  }
}

function issueIds(input: Parameters<typeof runExecutionPreviewDataConnectorDiagnostics>[0]): string[] {
  return runExecutionPreviewDataConnectorDiagnostics(input).issues.map((issue) => issue.id)
}

describe('execution-preview-data-connector-diagnostics', () => {
  it('detects a missing userId', () => {
    expect(issueIds({ rawSnapshot: raw({ userId: undefined }) })).toContain('missing_user_id')
  })

  it('detects an invalid date range', () => {
    expect(issueIds({ sanitizedSnapshot: sanitized({ dateRange: { startDate: 'bad', endDate: '2026-01-01' } }) })).toContain('invalid_date_range')
  })

  it('detects an empty task collection', () => {
    expect(issueIds({ sanitizedSnapshot: sanitized({ tasks: [] }) })).toContain('no_tasks')
  })

  it('detects an empty objective collection', () => {
    expect(issueIds({ sanitizedSnapshot: sanitized({ objectives: [] }) })).toContain('no_objectives')
  })

  it('detects missing planning data', () => {
    expect(issueIds({ sanitizedSnapshot: sanitized({ schedules: [] }) })).toContain('no_schedules')
  })

  it('detects missing settings', () => {
    expect(issueIds({ rawSnapshot: raw({ settings: undefined }) })).toContain('missing_settings')
  })

  it('detects when too many raw items were rejected', () => {
    expect(issueIds({
      rawSnapshot: raw({ tasks: [{}, {}, {}, {}], objectives: [], schedules: [], sessions: [] }),
      sanitizedSnapshot: sanitized({ tasks: [{}], objectives: [], schedules: [], sessions: [] }),
    })).toContain('too_many_invalid_items')
  })

  it('detects canApplyPreview=true as critical', () => {
    const result = runExecutionPreviewDataConnectorDiagnostics({
      providerState: { ...provider(), canApplyPreview: true } as unknown as ExecutionPreviewProviderState,
    })
    expect(result.issues.map((issue) => issue.id)).toContain('can_apply_preview_true')
    expect(result.status).toBe('critical')
  })

  it('detects previewPlan.canApplyLater=true as critical', () => {
    expect(issueIds({ providerState: provider({ previewPlan: { readiness: { canApplyLater: true } } as never }) })).toContain('can_apply_later_true')
  })

  it('detects ready without a preview plan', () => {
    expect(issueIds({ providerState: provider() })).toContain('ready_but_no_plan')
  })

  it('detects errors inconsistent with the provider status', () => {
    expect(issueIds({ providerState: provider({ status: 'ready_with_warnings', errors: ['failure'] }) })).toContain('errors_without_failed_status')
  })

  it('detects NaN and Infinity', () => {
    const result = runExecutionPreviewDataConnectorDiagnostics({
      sanitizedSnapshot: sanitized({ tasks: [{ remainingMinutes: Number.NaN }], objectives: [{ score: Number.POSITIVE_INFINITY }] }),
    })
    expect(result.issues.map((issue) => issue.id)).toContain('invalid_number_format')
    expect(result.status).toBe('critical')
  })

  it('detects mutation against an injected raw snapshot baseline', () => {
    const baseline = raw()
    const mutated = structuredClone(baseline)
    mutated.tasks.push({ id: 'unexpected' })
    expect(issueIds({ rawSnapshot: mutated, rawSnapshotBaseline: baseline })).toContain('raw_snapshot_mutated')
  })

  it('detects unnecessary sensitive data in a snapshot or preview', () => {
    const result = runExecutionPreviewDataConnectorDiagnostics({
      rawSnapshot: raw({ auth: { accessToken: 'must-not-leak' } }),
      providerState: provider({ previewPlan: { debug: { apiKey: 'must-not-leak-either' } } as never }),
    })
    expect(result.issues.map((issue) => issue.id)).toContain('unnecessary_sensitive_data')
    expect(result.issues.find((issue) => issue.id === 'unnecessary_sensitive_data')?.message).not.toContain('must-not-leak')
  })
})
