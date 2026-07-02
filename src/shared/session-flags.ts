export const sessionFlags = {
  // Shadow flags
  sessionPlanV2ShadowEnabled: true,
  sessionInputAdapterEnabled: true,
  sessionContractBuilderEnabled: true,
  sessionPreflightEnabled: true,
  sessionTimingEngineEnabled: true,
  sessionProtectionPlanShadowEnabled: true,
  sessionLifecycleShadowEnabled: true,
  sessionInterruptionPolicyShadowEnabled: true,
  sessionClosurePlanEnabled: true,
  sessionIntegrityShadowEnabled: true,
  sessionOutcomeShadowEnabled: true,
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
