import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props<T> {
  items: readonly T[];
  /** Altezza fissa di ogni riga (px). */
  rowHeight: number;
  renderRow: (item: T, index: number, root: HTMLDivElement | null) => ReactNode;
  getKey: (item: T, index: number) => string;
  className?: string;
  /** Righe extra sopra/sotto la finestra visibile. */
  overscan?: number;
  ariaLabel?: string;
}

/** Altezza ipotizzata finché il contenitore non è misurato (es. jsdom). */
const FALLBACK_HEIGHT = 480;

/**
 * Lista virtualizzata minimale (senza dipendenze): nel DOM esistono solo le
 * righe visibili + overscan, qualunque sia la lunghezza dell'elenco.
 * Lo scroll percorre l'intero elenco.
 */
export default function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  getKey,
  className = '',
  overscan = 4,
  ariaLabel,
}: Props<T>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setRoot(el);
    const measure = () => setHeight(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const viewport = height > 0 ? height : FALLBACK_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);

  const rows: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    rows.push(
      <div
        key={getKey(items[i], i)}
        role="listitem"
        aria-setsize={items.length}
        aria-posinset={i + 1}
        style={{ position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: rowHeight }}
      >
        {renderRow(items[i], i, root)}
      </div>,
    );
  }

  return (
    <div
      ref={ref}
      className={`overflow-y-auto overscroll-contain ${className}`}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      data-total={items.length}
    >
      <div role="list" aria-label={ariaLabel} style={{ position: 'relative', height: items.length * rowHeight }}>
        {rows}
      </div>
    </div>
  );
}
