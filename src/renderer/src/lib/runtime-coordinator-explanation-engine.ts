import type {
  BlockingProfileDraft,
  RuntimeSignalBridgePlan,
  RuntimeClosureBridgePlan,
  RuntimeCoordinatorExplanation,
} from '@shared/runtime-coordinator-model'

export function buildRuntimeCoordinatorExplanation(input: {
  blockingProfileDraft: BlockingProfileDraft
  signalBridgePlan: RuntimeSignalBridgePlan
  closureBridgePlan: RuntimeClosureBridgePlan
}): RuntimeCoordinatorExplanation {
  const { blockingProfileDraft } = input

  const title = 'Session Runtime Plan'
  let summary = ''
  
  if (blockingProfileDraft.mode === 'blocklist') {
    summary = `The session will block ${blockingProfileDraft.apps.block.length} apps and ${blockingProfileDraft.sites.block.length} sites.`
  } else if (blockingProfileDraft.mode === 'allowlist' || blockingProfileDraft.mode === 'strict_allowlist') {
    summary = `The session will restrict access to only ${blockingProfileDraft.apps.allow.length} allowed apps and ${blockingProfileDraft.sites.allow.length} sites.`
  } else {
    summary = 'The session will run in monitoring or manual review mode.'
  }

  const reasons = ['Generated explanation based on BlockingProfileDraft, SignalBridgePlan and ClosureBridgePlan.']
  
  return {
    title,
    summary,
    reasons,
    warnings: [],
  }
}
