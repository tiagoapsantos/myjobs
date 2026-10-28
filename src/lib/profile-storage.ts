import type { EducationEntry, JobPreferences, LanguageEntry, PersonalDetails, ProfessionalAreaSelection, ProfessionalProfile, ProfileLoadResult, SkillEntry, WorkExperience } from '../types/profile';
import { PROFESSIONAL_AREAS } from '../types/profile';

export const PROFILE_STORAGE_KEY = 'myjobs:demo:v1:professional-profile:v1';
export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
export interface ProfileStore { load(): ProfileLoadResult; save(profile: ProfessionalProfile): ProfessionalProfile; clear(): void; }

const text = (value: unknown): string => typeof value === 'string' ? value : '';
const list = <T extends string>(value: unknown, allowed?: readonly T[]): T[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => typeof item === 'string' && (!allowed || allowed.includes(item as T)));
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const id = (value: unknown): string => typeof value === 'string' && value.length > 0 ? value : crypto.randomUUID();

export function createEmptyProfile(): ProfessionalProfile {
  return {
    version: 1,
    personal: { fullName: '', email: '', phone: '', location: '', country: '', linkedin: '', github: '', website: '' },
    areas: [], experience: [], education: [], skills: [], languages: [],
    preferences: { modalities: [], locations: [], countries: [], contractTypes: [], schedules: [], minimumSalary: '', currency: 'EUR', availability: '', internationalRemote: false },
    updatedAt: '',
  };
}

export function normalizeProfile(value: unknown): ProfessionalProfile {
  const root = object(value);
  const personal = object(root.personal);
  const preferences = object(root.preferences);
  const areas: ProfessionalAreaSelection[] = Array.isArray(root.areas) ? root.areas.flatMap((entry) => {
    const item = object(entry);
    if (!PROFESSIONAL_AREAS.includes(item.name as (typeof PROFESSIONAL_AREAS)[number])) return [];
    return [{ name: item.name as ProfessionalAreaSelection['name'], priority: Number.isInteger(item.priority) && Number(item.priority) >= 1 ? Math.min(Number(item.priority), 6) : 1, desiredRoles: list<string>(item.desiredRoles) }];
  }) : [];
  const experience: WorkExperience[] = Array.isArray(root.experience) ? root.experience.map((entry) => { const item=object(entry); return {id:id(item.id),title:text(item.title),company:text(item.company),location:text(item.location),startDate:text(item.startDate),endDate:text(item.endDate),current:item.current===true,description:text(item.description)}; }) : [];
  const education: EducationEntry[] = Array.isArray(root.education) ? root.education.map((entry) => { const item=object(entry); return {id:id(item.id),institution:text(item.institution),course:text(item.course),fieldOfStudy:text(item.fieldOfStudy),startDate:text(item.startDate),endDate:text(item.endDate),description:text(item.description)}; }) : [];
  const skills: SkillEntry[] = Array.isArray(root.skills) ? root.skills.flatMap((entry) => { const item=object(entry); if (!['technical','personal','tool'].includes(text(item.kind))) return []; return [{id:id(item.id),name:text(item.name),kind:item.kind as SkillEntry['kind'],technology:text(item.technology),level:['beginner','intermediate','advanced','expert'].includes(text(item.level)) ? item.level as SkillEntry['level'] : ''}]; }) : [];
  const languages: LanguageEntry[] = Array.isArray(root.languages) ? root.languages.flatMap((entry) => { const item=object(entry); if (!['basic','intermediate','advanced','fluent','native'].includes(text(item.level))) return []; return [{id:id(item.id),name:text(item.name),level:item.level as LanguageEntry['level']}]; }) : [];
  const personalResult: PersonalDetails = {fullName:text(personal.fullName),email:text(personal.email),phone:text(personal.phone),location:text(personal.location),country:text(personal.country),linkedin:text(personal.linkedin),github:text(personal.github),website:text(personal.website)};
  const prefs: JobPreferences = {
    modalities:list(preferences.modalities,['onsite','hybrid','remote']), locations:list(preferences.locations), countries:list(preferences.countries),
    contractTypes:list(preferences.contractTypes), schedules:list(preferences.schedules), minimumSalary:text(preferences.minimumSalary),
    currency:text(preferences.currency)||'EUR', availability:text(preferences.availability), internationalRemote:preferences.internationalRemote===true,
  };
  return {version:1,personal:personalResult,areas,experience,education,skills,languages,preferences:prefs,updatedAt:text(root.updatedAt)};
}

function hasInvalidProfileData(value: unknown): boolean {
  const root=object(value);let invalid=false;
  for(const key of ['personal','preferences'])if(root[key]!==undefined&&(!root[key]||typeof root[key]!=='object'||Array.isArray(root[key])))invalid=true;
  const personal=object(root.personal);for(const key of ['fullName','email','phone','location','country','linkedin','github','website'])if(personal[key]!==undefined&&typeof personal[key]!=='string')invalid=true;
  const preferences=object(root.preferences);for(const key of ['modalities','locations','countries','contractTypes','schedules'])if(preferences[key]!==undefined&&!Array.isArray(preferences[key]))invalid=true;
  if(preferences.internationalRemote!==undefined&&typeof preferences.internationalRemote!=='boolean')invalid=true;
  for(const key of ['areas','experience','education','skills','languages'])if(root[key]!==undefined&&(!Array.isArray(root[key])||(root[key] as unknown[]).some(item=>!item||typeof item!=='object'||Array.isArray(item))))invalid=true;
  return invalid;
}

export function createProfileStore(storage: KeyValueStorage): ProfileStore {
  return {
    load() {
      let raw: string | null;
      try { raw = storage.getItem(PROFILE_STORAGE_KEY); } catch { return {profile:createEmptyProfile(),recoveredInvalidData:true}; }
      if (raw === null) return {profile:createEmptyProfile(),recoveredInvalidData:false};
      try { const decoded: unknown = JSON.parse(raw); if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return {profile:createEmptyProfile(),recoveredInvalidData:true}; const version=object(decoded).version; if (version !== undefined && version !== 1) return {profile:createEmptyProfile(),recoveredInvalidData:true}; return {profile:normalizeProfile(decoded),recoveredInvalidData:hasInvalidProfileData(decoded)}; }
      catch { return {profile:createEmptyProfile(),recoveredInvalidData:true}; }
    },
    save(profile) {
      const normalized = normalizeProfile(profile);
      normalized.updatedAt = new Date().toISOString();
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    },
    clear() { storage.removeItem(PROFILE_STORAGE_KEY); },
  };
}



