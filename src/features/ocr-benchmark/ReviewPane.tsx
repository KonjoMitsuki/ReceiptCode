import { useState } from 'react';
import { ItemList } from '../../components/ItemList';
import { ManualAddForm } from '../../components/ManualAddForm';
import { BarcodeViewer } from '../../components/BarcodeViewer';
import { canConfirmItem, getScannableItems, updateReceiptItem, validationForJan } from '../receipt/itemOperations';
import { parseReceipt } from '../receipt/receiptParser';
import { createId } from '../../lib/id';
import type { ReceiptItem } from '../../types/receipt';
import type { BenchmarkResult } from './types';

/** The same receipt parser and JAN confirmation component as the normal reading flow. */
export default function ReviewPane({ result }: { result: BenchmarkResult }) {
  const [items, setItems] = useState<ReceiptItem[]>(() => parseReceipt(result.text).items);
  const [manual, setManual] = useState(false);
  const [barcodeId, setBarcodeId] = useState<string | null>(null);
  const scannable = getScannableItems(items);
  const index = scannable.findIndex((item) => item.id === barcodeId);

  function updateItem(id: string, patch: Partial<Pick<ReceiptItem, 'name' | 'jan'>>) {
    setItems((previous) => previous.map((item) => item.id === id ? updateReceiptItem(item, patch) : item));
  }

  if (index >= 0) return <div className="benchmark-barcode-overlay">
    <BarcodeViewer item={scannable[index]} items={scannable} index={index} total={scannable.length}
      hasPrevious={index > 0} hasNext={index < scannable.length - 1}
      onPrevious={() => setBarcodeId(scannable[index - 1].id)}
      onNext={() => setBarcodeId(scannable[index + 1].id)}
      onSelect={setBarcodeId} onClose={() => setBarcodeId(null)} />
  </div>;

  return <div className="benchmark-review">
    {manual ? <div className="benchmark-manual"><ManualAddForm onCancel={() => setManual(false)} onAdd={(name, jan) => {
      const { validation, format } = validationForJan(jan);
      setItems((previous) => [...previous, {
        id: createId(), receiptId: previous[0]?.receiptId ?? createId(), name: name.trim(), jan,
        validation, format, confirmed: validation === 'valid', source: 'manual', warnings: [],
      }]);
      setManual(false);
    }} /></div> : <ItemList comparison items={items} onUpdateItem={updateItem}
      onDeleteItem={(id) => setItems((previous) => previous.filter((item) => item.id !== id))}
      onToggleConfirm={(id) => setItems((previous) => previous.map((item) => item.id === id && canConfirmItem(item) ? { ...item, confirmed: !item.confirmed } : item))}
      onShowBarcode={setBarcodeId} onManualAddOpenChange={setManual} />}
  </div>;
}
