const JAN_LABEL_RE = /(?:JAN|ＪＡＮ|EAN|ＥＡＮ|バーコード|商品コード|品番)/i;

const SUMMARY_RE =
  /^\s*[*#・]?\s*(?:合計|小計|税込合計|税抜合計|お買上合計|お買い上げ合計|お預り|お預かり|お釣|釣銭|返金)/;

const META_RE =
  /(?:電話\s*(?:番号|NO|No|no|[:：]|\d)|TEL\s*[:：]?|FAX\s*[:：]?|会員\s*(?:番号|NO|No|no|カード)|レシート\s*(?:NO|No|no|番号)|伝票\s*(?:NO|No|no|番号)|取引\s*(?:NO|No|no|番号)|担当\s*[:：]?|営業時間|住所\s*[:：]?|登録番号|お客様\s*[:：]?|支払方法|^\s*(?:現金|クレジット|電子マネー)\s*[:：]?)/i;

const DATE_RE =
  /(?:(?:19|20)\d{2}\s*[年/.-]\s*\d{1,2}\s*[月/.-]\s*\d{1,2})|(?:\b(?:19|20)\d{2}[ -]\d{2}[ -]\d{2}\b)|(?:\b(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\b)|(?:\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b)/;

const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;

const HEADER_RE =
  /(?:レシート|領収書|ご来店|ありがとう|営業時間|電話|TEL|FAX|住所|登録番号|店番|レジ\s*(?:NO|No|no|番号|#|担当)|責任者|お買い上げ|明細|株式会社|有限会社|店\s*$|様\s*$)/i;

const PRICE_RE =
  /(?:[¥￥]\s*[\d,]+|(?<![\d,])[\d,]+\s*円|(?:単価|@)\s*[\d,]+|\d+\s*[%％]\s*(?:OFF|off|引|引き))/;

const LETTER_RE = /\p{L}/u;

export function hasLetters(value: string): boolean {
  return LETTER_RE.test(value);
}

export function isJanLabelLine(line: string): boolean {
  return JAN_LABEL_RE.test(line);
}

export function isDateOrTimeLine(line: string): boolean {
  return DATE_RE.test(line) || TIME_RE.test(line);
}

export function isNonProductLine(line: string): boolean {
  return (
    SUMMARY_RE.test(line) ||
    META_RE.test(line) ||
    DATE_RE.test(line) ||
    TIME_RE.test(line)
  );
}

export function hasPrice(line: string): boolean {
  return PRICE_RE.test(line);
}

/**
 * 同じ行にある商品名から、JAN候補・価格・ラベルなどを取り除く。
 * 商品名に含まれる「8枚切」のような数量表現は残す。
 */
export function cleanProductName(line: string): string {
  return line
    .replace(/(?:JAN|EAN|バーコード|商品コード|品番)\s*(?:コード)?\s*[:：]?/gi, ' ')
    .replace(/(?:[¥￥]\s*[\d,]+)/g, ' ')
    .replace(/(?<![\d,])[\d,]+\s*円/g, ' ')
    .replace(/(?:単価|@)\s*[\d,]+/g, ' ')
    .replace(/\d+\s*[%％]\s*(?:OFF|off|引|引き)/g, ' ')
    .replace(/[（(]\s*税(?:込|抜)\s*[)）]/g, ' ')
    .replace(/[×xX]\s*\d+\s*(?:個|点|本|枚|袋)?/g, ' ')
    .replace(/(?:税込|税抜|軽減税率?)\s*$/g, ' ')
    .replace(/[|｜]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:：,、。・|/]+|[\s\-–—:：,、。・|/]+$/g, '')
    .trim();
}

export function isLikelyProductName(line: string): boolean {
  if (!line || line.length < 2) return false;
  if (!hasLetters(line)) return false;
  if (HEADER_RE.test(line)) return false;
  if (isNonProductLine(line)) return false;
  if (JAN_LABEL_RE.test(line)) return false;
  if (/^[\d\s¥￥,.\-–—/]+$/.test(line)) return false;

  return true;
}

export interface TextRange {
  start: number;
  end: number;
}

export function removeRanges(line: string, ranges: TextRange[]): string {
  if (ranges.length === 0) return line;

  const chars = [...line];
  for (const range of ranges) {
    for (let index = range.start; index < range.end && index < chars.length; index += 1) {
      chars[index] = ' ';
    }
  }
  return chars.join('');
}
