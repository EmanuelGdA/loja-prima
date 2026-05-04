const admin = require("firebase-admin");
const path = require("path");
require('dotenv').config();

let serviceAccount;

// LÓGICA HÍBRIDA:
// Se existir a variável de ambiente (Produção/Render)
if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} else {
    // Se não, tenta ler o arquivo local (Seu PC)
    try {
        serviceAccount = require(path.join(__dirname, "../../firebase-key.json"));
    } catch (error) {
        console.error("ERRO CRÍTICO: Nenhuma credencial do Firebase encontrada.");
    }
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "maely-cristina-b0ce1.firebasestorage.app"
    });
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    module.exports = { db, bucket };
} else {
    module.exports = null;
}