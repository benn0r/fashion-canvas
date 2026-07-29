import AsyncStorage from "@react-native-async-storage/async-storage";
import { initialLibrary } from "./library";
import type { LibraryState } from "./types";

const STORAGE_KEY = "fashion-canvas-library-v1";

export async function loadLibrary(): Promise<LibraryState> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return initialLibrary();
  try { return { ...initialLibrary(), ...JSON.parse(stored) as LibraryState }; }
  catch { return initialLibrary(); }
}

export async function saveLibrary(state: LibraryState) { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
