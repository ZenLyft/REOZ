/**
 * ZenLyft Revenue Engine - Weekly Acquisition Targets & Conversion Intelligence
 * Enforces mandatory 100+ unique leads/week and >=10% onboarding conversion (10+ clients/week).
 */

export interface WeeklyCohortKpis {
  weekly_leads_target: number;
  weekly_leads_discovered: number;
  weekly_leads_progress_pct: number;
  weekly_onboarding_target: number;
  weekly_clients_onboarded: number;
  weekly_onboarding_progress_pct: number;
  conversion_rate_pct: number;
  target_met: boolean;
  active_followups_count: number;
  overdue_followups_count: number;
  pipeline_health_status: 'healthy' | 'needs_attention' | 'critical_bottleneck';
  bottleneck_diagnosis: string;
  recommended_corrective_action: string;
}

export interface FollowUpScheduleStep {
  day_offset: number;
  label: string;
  intent: 'intro' | 'benefit' | 'solution_observation' | 'demo_invitation' | 'breakup_check' | 'nurture';
  sample_angle: string;
}

export const MANDATORY_FOLLOW_UP_CADENCE: readonly FollowUpScheduleStep[] = [
  {
    day_offset: 0,
    label: 'Day 0: Initial Introduction',
    intent: 'intro',
    sample_angle: 'Personalised observation of their current web presence or student outpass workflow.',
  },
  {
    day_offset: 3,
    label: 'Day 3: Concrete Business Benefit',
    intent: 'benefit',
    sample_angle: 'How similar businesses in Tamil Nadu increased WhatsApp bookings by 3x with modern mobile architecture.',
  },
  {
    day_offset: 7,
    label: 'Day 7: Actionable Solution Observation',
    intent: 'solution_observation',
    sample_angle: 'A specific friction point found on their mobile site or hostel gate register with a 1-sentence fix.',
  },
  {
    day_offset: 12,
    label: 'Day 12: Interactive Demo Invitation',
    intent: 'demo_invitation',
    sample_angle: 'Live 5-minute interactive walkthrough of HOMS portal or business booking widget.',
  },
  {
    day_offset: 18,
    label: 'Day 18: Final Direct Check',
    intent: 'breakup_check',
    sample_angle: 'Direct, polite confirmation asking if digital upgrade is a current priority for this quarter.',
  },
  {
    day_offset: 30,
    label: 'Day 30: Quarterly Nurture',
    intent: 'nurture',
    sample_angle: 'Move to low-frequency educational updates if no reply.',
  },
];

/**
 * Computes live weekly cohort metrics against mandatory targets
 */
export function calculateWeeklyCohortMetrics(
  discoveredCount: number,
  onboardedCount: number,
  overdueCount: number = 0
): WeeklyCohortKpis {
  const LEADS_TARGET = 100;
  const ONBOARDING_TARGET = 10;

  const leadsProgressPct = Math.min(100, Math.round((discoveredCount / LEADS_TARGET) * 100));
  const onboardingProgressPct = Math.min(100, Math.round((onboardedCount / ONBOARDING_TARGET) * 100));
  const conversionRatePct =
    discoveredCount > 0 ? parseFloat(((onboardedCount / discoveredCount) * 100).toFixed(1)) : 0;

  let health: 'healthy' | 'needs_attention' | 'critical_bottleneck' = 'healthy';
  let diagnosis = 'Operating on track toward weekly cohort targets.';
  let action = 'Maintain current Overpass discovery velocity and prompt WhatsApp approval responses.';

  if (discoveredCount < 20) {
    health = 'critical_bottleneck';
    diagnosis = `Lead discovery deficit: Discovered only ${discoveredCount}/100 weekly target.`;
    action =
      'Trigger Chief AI Orchestrator to run discovery in Coimbatore, Erode, and Tiruppur Overpass nodes.';
  } else if (onboardedCount === 0 && discoveredCount >= 30) {
    health = 'needs_attention';
    diagnosis = 'Conversion lag: Discovered leads are not advancing through proposal and onboarding stages.';
    action =
      'Review pending approvals in Inbox. Approve and dispatch WhatsApp outreach proposals to qualified leads.';
  } else if (overdueCount > 5) {
    health = 'needs_attention';
    diagnosis = `${overdueCount} prospect follow-ups are overdue past the Day 3/Day 7 cadence.`;
    action = 'Run Follow-up Agent to dispatch Day 3/Day 7 value touchpoints.';
  }

  return {
    weekly_leads_target: LEADS_TARGET,
    weekly_leads_discovered: discoveredCount,
    weekly_leads_progress_pct: leadsProgressPct,
    weekly_onboarding_target: ONBOARDING_TARGET,
    weekly_clients_onboarded: onboardedCount,
    weekly_onboarding_progress_pct: onboardingProgressPct,
    conversion_rate_pct: conversionRatePct,
    target_met: discoveredCount >= LEADS_TARGET && onboardedCount >= ONBOARDING_TARGET,
    active_followups_count: discoveredCount,
    overdue_followups_count: overdueCount,
    pipeline_health_status: health,
    bottleneck_diagnosis: diagnosis,
    recommended_corrective_action: action,
  };
}
