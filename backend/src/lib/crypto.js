const crypto = require('crypto');
require('dotenv').config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.warn("⚠️ Advertencia: ENCRYPTION_KEY no está configurada correctamente. Debe tener 64 caracteres hex (32 bytes).");
}

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // Para AES, este siempre es de 16

function encrypt(text) {
    if (!text) return text;
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) return text; // Fallback if no key
    
    try {
        let iv = crypto.randomBytes(IV_LENGTH);
        let cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error("Error al encriptar:", error);
        return text;
    }
}

function decrypt(text) {
    if (!text) return text;
    if (!text.includes(':')) return text; // Probablemente no está encriptado o es un formato viejo
    
    try {
        let textParts = text.split(':');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        // Si falla (ej. texto que casualmente tenía ":" pero no era encriptado), devolver original
        return text;
    }
}

module.exports = { encrypt, decrypt };
