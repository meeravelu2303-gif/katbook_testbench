import { createHash } from 'crypto';
import { DEDUPE_TAG_PREFIX } from '../../config/bugzilla.config';

const VOLATILE_PATTERNS: RegExp[] = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, // UUID
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // email
  /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, // JWT
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IPv4
  /:\d{2,5}\b/g, // port
  /\b\d+ms\b/g, // durations
  /\b\d{4,}\b/g, // generic long numbers (ids, correlation numbers)
];

/** Collapses volatile substrings so the same underlying fault hashes the same way across runs. */
export function normalizeForFingerprint(input: string): string {
  return VOLATILE_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '<x>'), input);
}

export interface FingerprintInput {
  endpoint: string;
  validator: string;
  message: string;
}

export function computeFingerprintTag({ endpoint, validator, message }: FingerprintInput): string {
  const normalized = normalizeForFingerprint(`${endpoint}|${validator}|${message}`);
  const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 6);
  return `${DEDUPE_TAG_PREFIX}-${hash.toUpperCase()}`;
}

export function candidateFaultKey(endpoint: string, validator: string): string {
  return `${endpoint || 'SYSTEMIC'}||${validator}`;
}
