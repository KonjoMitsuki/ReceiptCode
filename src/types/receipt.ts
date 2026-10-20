export type JanFormat = 'EAN13' | 'EAN8';

export type ValidationState = 'valid' | 'invalid' | 'needs-review';

export interface ReceiptItem {
  id: string;
  receiptId: string;
  name: string;
  jan: string;
  format: JanFormat | null;
  validation: ValidationState;
  confirmed: boolean;
  source: 'ocr' | 'manual';
  sourceLine?: number;
  warnings: string[];
}

export interface ReceiptSession {
  id: string;
  createdAt: string;
  items: ReceiptItem[];
}
