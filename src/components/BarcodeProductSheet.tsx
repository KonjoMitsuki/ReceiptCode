import { useId, useRef, useState } from 'react';
import type { ReceiptItem } from '../types/receipt';

interface Props {
  items: ReceiptItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function BarcodeProductSheet({ items, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const handleRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const close = () => { setOpen(false); setDragHeight(null); handleRef.current?.focus(); };

  return (
    <section className={`barcode-product-sheet${open ? ' is-open' : ''}${dragHeight !== null ? ' is-dragging' : ''}`}
      aria-label="バーコードの商品リスト" style={dragHeight === null ? undefined : { height: dragHeight }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <button ref={handleRef} type="button" className="product-sheet-handle"
        aria-expanded={open} aria-controls={listId} aria-label={open ? '商品リストを閉じる' : '商品リストを開く'}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          setOpen(value => !value);
        }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          suppressClick.current = false;
          drag.current = { y: event.clientY, height: event.currentTarget.parentElement!.getBoundingClientRect().height, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          const delta = drag.current.y - event.clientY;
          if (Math.abs(delta) > 6) drag.current.moved = true;
          if (drag.current.moved) setDragHeight(Math.max(72, Math.min(window.innerHeight / 2, drag.current.height + delta)));
        }}
        onPointerUp={event => {
          const current = drag.current;
          drag.current = null;
          setDragHeight(null);
          if (!current?.moved) return;
          suppressClick.current = true;
          const delta = current.y - event.clientY;
          if (Math.abs(delta) > 24) setOpen(delta > 0);
        }}
        onPointerCancel={() => { drag.current = null; setDragHeight(null); suppressClick.current = true; }}>
        <span className="product-sheet-grip" aria-hidden="true" />
        <span>商品リスト <span className="product-sheet-count">{items.length}件</span></span>
        <span aria-hidden="true">{open ? '⌄' : '⌃'}</span>
      </button>
      <div id={listId} className="product-sheet-list" hidden={!open && dragHeight === null}>
        <ul>
          {items.map((item, index) => (
            <li key={item.id}>
              <button type="button" aria-current={item.id === selectedId ? 'true' : undefined}
                onClick={() => { onSelect(item.id); close(); }}>
                <span className="product-sheet-index">{index + 1}</span>
                <span><strong>{item.name.trim() || '商品名未認識'}</strong><small>{item.jan}</small></span>
                {item.id === selectedId && <span className="product-sheet-current">表示中</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
