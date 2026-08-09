import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '42cc43e03e0747b24ebb49298dc79b0cde6db3b2b499bb66b16360b4f3d9406a'; // Usar clave temporal de dev si falta
const ALGORITHM = 'aes-256-cbc';

export function decrypt(text: string | null | undefined): string {
    if (!text) return text || '';
    if (!text.includes(':')) return text; // Probably not encrypted
    
    try {
        let textParts = text.split(':');
        let iv = Buffer.from(textParts.shift()!, 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        return text;
    }
}
