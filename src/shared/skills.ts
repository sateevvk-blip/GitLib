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
  /** В каталоге больше 30 навыков, взяты первые 30. */
  truncated: boolean;
}
