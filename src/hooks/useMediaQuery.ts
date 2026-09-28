import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;
}

/** True finché la media query è soddisfatta; si aggiorna al resize/rotazione. */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setValue(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return value;
}
