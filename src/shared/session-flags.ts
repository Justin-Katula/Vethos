export const sessionFlags = {
  // Active/Enabled flags
  sessionPlanV2Enabled: true,
  sessionInputAdapterEnabled: true,
  sessionContractBuilderEnabled: true,
  sessionPreflightEnabled: true,
  sessionTimingEngineEnabled: true,
  sessionProtectionPlanEnabled: true,
  sessionLifecycleEnabled: true,
  sessionInterruptionPolicyEnabled: true,
  sessionClosurePlanEnabled: true,
  sessionIntegrityEnabled: true,
  sessionOutcomeEnabled: true,
  sessionExplanationsEnabled: true,
  sessionDiagnosticsEnabled: true,

  // Control flags (MUST BE FALSE to avoid real side effects)
  sessionControlsDisplay: false,
  sessionControlsSessionStore: false,
  sessionControlsTimer: false,
  sessionControlsBlocking: false,
  sessionControlsOverlay: false,
  sessionControlsCompletion: false,
  sessionControlsAutoStart: false,
}
