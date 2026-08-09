'use server';
import { decrypt } from '@/lib/crypto';

export async function decryptMessagesAction(texts: (string | null | undefined)[]): Promise<string[]> {
  return texts.map(t => decrypt(t));
}
