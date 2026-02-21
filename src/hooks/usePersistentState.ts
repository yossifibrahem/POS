import { useState, useEffect, useCallback } from "react";

type StorageType = "local" | "session";

interface UsePersistentStateOptions<T> {
  key: string;
  defaultValue: T;
  storage?: StorageType;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
}

export function usePersistentState<T>({
  key,
  defaultValue,
  storage = "local",
  serialize = JSON.stringify,
  deserialize = JSON.parse,
}: UsePersistentStateOptions<T>): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [state, setState] = useState<T>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Get storage object based on type
  const getStorage = useCallback(() => {
    return storage === "local" ? localStorage : sessionStorage;
  }, [storage]);

  // Load from storage on mount
  useEffect(() => {
    try {
      const storageObj = getStorage();
      const stored = storageObj.getItem(key);
      if (stored !== null) {
        setState(deserialize(stored));
      }
    } catch (error) {
      console.warn(`Error loading persisted state for key "${key}":`, error);
    }
    setIsHydrated(true);
  }, [key, deserialize, getStorage]);

  // Save to storage when state changes
  useEffect(() => {
    if (!isHydrated) return;
    
    try {
      const storageObj = getStorage();
      storageObj.setItem(key, serialize(state));
    } catch (error) {
      console.warn(`Error saving persisted state for key "${key}":`, error);
    }
  }, [state, key, serialize, isHydrated, getStorage]);

  // Wrapper for setState that matches React's useState API
  const setPersistentState = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const newValue = typeof value === "function" 
        ? (value as (prev: T) => T)(prev) 
        : value;
      return newValue;
    });
  }, []);

  return [state, setPersistentState, isHydrated];
}

// Hook specifically for auth-related cached state
export function useCachedAuthState() {
  const [cachedUser, setCachedUser, isHydrated] = usePersistentState<{
    id: string;
    email?: string;
    lastChecked: number;
  } | null>({
    key: "cached_auth_user",
    defaultValue: null,
    storage: "local",
  });

  const updateCachedUser = useCallback((user: { id: string; email?: string } | null) => {
    if (user) {
      setCachedUser({
        ...user,
        lastChecked: Date.now(),
      });
    } else {
      setCachedUser(null);
    }
  }, [setCachedUser]);

  // Check if cache is still valid (within 24 hours)
  const isCacheValid = useCallback(() => {
    if (!cachedUser) return false;
    const cacheAge = Date.now() - cachedUser.lastChecked;
    return cacheAge < 24 * 60 * 60 * 1000; // 24 hours
  }, [cachedUser]);

  return {
    cachedUser,
    updateCachedUser,
    isCacheValid,
    isHydrated,
  };
}
