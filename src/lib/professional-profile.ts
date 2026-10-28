import { createProfileStore } from './profile-storage';
import type { KeyValueStorage } from './profile-storage';
import type { ProfileLoadResult, ProfessionalProfile } from '../types/profile';

const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
const store = () => createProfileStore(browserStorage);
export function loadProfessionalProfile(): ProfileLoadResult { return store().load(); }
export function saveProfessionalProfile(profile: ProfessionalProfile): ProfessionalProfile { return store().save(profile); }
export function clearProfessionalProfile(): void { store().clear(); }
