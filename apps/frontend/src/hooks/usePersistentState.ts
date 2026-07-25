import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * useState synchronisé avec localStorage : la valeur survit à la navigation
 * entre pages (démontage du composant) et au rechargement.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / mode privé : on ignore */
    }
  }, [key, value]);

  return [value, setValue];
}
