import "expo-sqlite/localStorage/install";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { createSecureAuthStorage } from "./secure-auth-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const legacySessionStorage = {
  async getItem(storageKey: string) {
    return localStorage.getItem(storageKey);
  },
  async setItem(storageKey: string, value: string) {
    localStorage.setItem(storageKey, value);
  },
  async removeItem(storageKey: string) {
    localStorage.removeItem(storageKey);
  },
};

const secureSessionStorage = createSecureAuthStorage(
  {
    getItem: (storageKey) =>
      SecureStore.getItemAsync(storageKey, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    setItem: (storageKey, value) =>
      SecureStore.setItemAsync(storageKey, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    removeItem: (storageKey) =>
      SecureStore.deleteItemAsync(storageKey, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
  },
  legacySessionStorage
);

export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: Platform.OS === "web" ? localStorage : secureSessionStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

if (supabase) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export function requireSupabase() {
  if (!supabase) throw new Error("Native backend is not configured.");
  return supabase;
}
