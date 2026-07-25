import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface SelectionContextValue {
  selectedIds: string[];
  toggle: (id: string) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);
const STORAGE_KEY = 'buzzy-selection';

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const persist = (next: string[]) => {
    setSelectedIds(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => persist([]), []);
  const isSelected = useCallback((id: string) => selectedIds.includes(id), [selectedIds]);

  return (
    <SelectionContext.Provider value={{ selectedIds, toggle, clear, isSelected }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection doit être utilisé dans SelectionProvider');
  return ctx;
}
