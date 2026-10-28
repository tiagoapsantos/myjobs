export const PROFESSIONAL_AREAS = [
  'AI Automation & Digital Operations',
  'Web Development',
  'AI-assisted Software Development',
  'Digital Marketing',
  'Graphic Design & Content Creation',
  'IT Support / Technical Support',
] as const;

export type ProfessionalAreaName = (typeof PROFESSIONAL_AREAS)[number];
export type SkillKind = 'technical' | 'personal' | 'tool';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type LanguageLevel = 'basic' | 'intermediate' | 'advanced' | 'fluent' | 'native';

export interface PersonalDetails {
  fullName: string; email: string; phone: string; location: string; country: string;
  linkedin: string; github: string; website: string;
}
export interface ProfessionalAreaSelection {
  name: ProfessionalAreaName; priority: number; desiredRoles: string[];
}
export interface WorkExperience {
  id: string; title: string; company: string; location: string; startDate: string;
  endDate: string; current: boolean; description: string;
}
export interface EducationEntry {
  id: string; institution: string; course: string; fieldOfStudy: string;
  startDate: string; endDate: string; description: string;
}
export interface SkillEntry {
  id: string; name: string; kind: SkillKind; technology: string; level: SkillLevel | '';
}
export interface LanguageEntry { id: string; name: string; level: LanguageLevel; }
export interface JobPreferences {
  modalities: Array<'onsite' | 'hybrid' | 'remote'>;
  locations: string[]; countries: string[]; contractTypes: string[]; schedules: string[];
  minimumSalary: string; currency: string; availability: string; internationalRemote: boolean;
}
export interface ProfessionalProfile {
  version: 1; personal: PersonalDetails; areas: ProfessionalAreaSelection[];
  experience: WorkExperience[]; education: EducationEntry[]; skills: SkillEntry[];
  languages: LanguageEntry[]; preferences: JobPreferences; updatedAt: string;
}
export interface ProfileLoadResult { profile: ProfessionalProfile; recoveredInvalidData: boolean; }
