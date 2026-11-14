export interface SkillAudit {
  name: string;
  url: string;
  checks: { provider: string; status: 'pass' | 'warn' | 'fail' | 'unknown'; url: string }[];
  unavailable: boolean;
}

export interface SkillsReport {
  checkedAt: string;
  skills: SkillAudit[];
  partial: boolean;
}
