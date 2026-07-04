export type ActivationBridgeStatus =
  | "not_ready"
  | "draft_ready"
  | "draft_ready_with_warnings"
  | "blocked_by_review"
  | "blocked_by_qa"
  | "blocked_by_preview_safety"
  | "blocked_by_missing_contract"
  | "unsafe"
  | "invalid";

export type ActivationBridgeSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type ActivationContractScope =
  | "preview_only"
  | "single_day"
  | "single_block"
  | "multi_block"
  | "full_preview"
  | "unknown";

export type ActivationFutureActionKind =
  | "future_apply_planning"
  | "future_create_session"
  | "future_start_session"
  | "future_enable_blocking"
  | "future_complete_task"
  | "future_reduce_remaining_minutes"
  | "future_persist_review"
  | "future_runtime_bridge";

export interface ActivationFutureActionDraft {
  id: string;
  kind: ActivationFutureActionKind;
  targetType:
    | "preview"
    | "day"
    | "block"
    | "session"
    | "runtime"
    | "task"
    | "planning";
  targetId?: string;
  label: string;
  status:
    | "blocked"
    | "requires_future_permission"
    | "requires_user_confirmation"
    | "requires_safety_check"
    | "not_supported_yet";
  reason: string;
  canExecuteNow: boolean;
  requiredFutureFlags: string[];
  requiredSafetyChecks: string[];
  confidence: number;
}

export type ActivationPreconditionStatus =
  | "passed"
  | "warning"
  | "failed"
  | "blocked"
  | "not_checked"
  | "not_applicable";

export interface ActivationPrecondition {
  id: string;
  label: string;
  category:
    | "preview"
    | "qa"
    | "manual_review"
    | "safety"
    | "runtime"
    | "data"
    | "ui"
    | "permissions"
    | "persistence";
  status: ActivationPreconditionStatus;
  severity: ActivationBridgeSeverity;
  reason: string;
  requiredForFutureActivation: boolean;
  confidence: number;
}

export interface ActivationPreconditionChecklist {
  status:
    | "all_passed_for_draft_only"
    | "warnings_for_draft_only"
    | "blocked"
    | "unsafe"
    | "invalid";
  items: ActivationPrecondition[];
  passedCount: number;
  warningCount: number;
  failedCount: number;
  blockedCount: number;
  canActivateNow: boolean;
  confidence: number;
}

export interface ExecutionContractDraftV2 {
  id: string;
  previewPlanId?: string;
  qaReportId?: string;
  manualReviewDraftId?: string;
  scope: ActivationContractScope;
  status:
    | "draft_only"
    | "draft_with_warnings"
    | "blocked"
    | "unsafe"
    | "invalid";
  approvedInPrinciple: boolean;
  futureActions: ActivationFutureActionDraft[];
  preconditions: ActivationPreconditionChecklist;
  warnings: string[];
  blockers: string[];
  canApplyPlanningNow: boolean;
  canCreateSessionsNow: boolean;
  canStartSessionsNow: boolean;
  canEnableBlockingNow: boolean;
  canCompleteTasksNow: boolean;
  canPersistContractNow: boolean;
  canActivateNow: boolean;
  metadata: {
    source: "activation_bridge_contract_draft";
    createdAt: string;
    modelVersion: number;
  };
  confidence: number;
}

export interface ActivationBridgeSafetyReport {
  status: "safe_for_draft" | "warning" | "blocked" | "critical";
  dangerousPermissionDetected: boolean;
  unsafeReasons: string[];
  warnings: string[];
  canApplyAnythingNow: boolean;
  canActivateNow: boolean;
  confidence: number;
}

export interface ActivationBridgeGateResult {
  status: ActivationBridgeStatus;
  contractDraft?: ExecutionContractDraftV2;
  safety: ActivationBridgeSafetyReport;
  canProceedToRealActivation: boolean;
  canApplyAnythingNow: boolean;
  blockers: string[];
  warnings: string[];
  nextRecommendedAction:
    | "keep_as_draft"
    | "fix_review_first"
    | "fix_qa_first"
    | "fix_preview_first"
    | "define_future_activation_protocol"
    | "do_not_activate"
    | "debug_only";
  confidence: number;
}

export interface ActivationBridgeDiagnostics {
  status: "healthy" | "warning" | "critical";
  issues: Array<{
    id: string;
    severity: ActivationBridgeSeverity;
    message: string;
    suggestion?: string;
  }>;
  summary: string[];
}

export interface ActivationBridgeExplanation {
  title: string;
  summary: string;
  keyPoints: string[];
  warnings: string[];
  nextRecommendedAction:
    | "keep_as_draft"
    | "review_blockers"
    | "fix_inputs"
    | "fix_review"
    | "fix_qa"
    | "do_not_activate";
  confidence: number;
}

export interface ActivationBridgeDraftV2 {
  id: string;
  status: ActivationBridgeStatus;
  contractDraft: ExecutionContractDraftV2;
  gateResult: ActivationBridgeGateResult;
  diagnostics: ActivationBridgeDiagnostics;
  explanation: ActivationBridgeExplanation;
  canProceedToRealActivation: boolean;
  canApplyAnythingNow: boolean;
  createdAt: string;
  confidence: number;
}
