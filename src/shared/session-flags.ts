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

  // Emergency rollback switches. Point 8 is live by default.
  sessionControlsDisplay: true,
  sessionControlsSessionStore: true,
  sessionControlsTimer: true,
  sessionControlsBlocking: true,
  sessionControlsOverlay: true,
  sessionControlsCompletion: true,
  sessionControlsAutoStart: true,
}
