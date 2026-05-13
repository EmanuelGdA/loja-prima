const admin = require('firebase-admin');

// 1. Configuração do Firebase
const serviceAccount = require("./firebase-key.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "maely-cristina-b0ce1.firebasestorage.app" 
    });
}

const bucket = admin.storage().bucket();

async function executarFaxina() {
    console.log("🧹 Iniciando faxina no Storage...");

    try {
        // Busca todos os arquivos do bucket
        const [files] = await bucket.getFiles();
        
        let contador = 0;
        let espacoEconomizado = 0;

        for (const file of files) {
            // LÓGICA: Se o arquivo NÃO termina com .webp, ele é uma "sobra" pesada
            // Ignoramos também nomes de pastas (arquivos que terminam com /)
            if (!file.name.endsWith('.webp') && !file.name.endsWith('/')) {
                
                try {
                    const [metadata] = await file.getMetadata();
                    const size = parseInt(metadata.size || 0);
                    
                    console.log(`🗑️ Deletando sobra pesada: ${file.name} (${(size / 1024 / 1024).toFixed(2)} MB)`);
                    
                    await file.delete();
                    
                    contador++;
                    espacoEconomizado += size;
                } catch (e) {
                    console.log(`⚠️ Erro ao apagar ${file.name}, pulando...`);
                }
            }
        }

        console.log("\n✨ FAXINA CONCLUÍDA!");
        console.log(`✅ Total de arquivos removidos: ${contador}`);
        console.log(`📉 Espaço liberado: ${(espacoEconomizado / 1024 / 1024).toFixed(2)} MB`);
        process.exit();

    } catch (error) {
        console.error("❌ Erro crítico durante a faxina:", error);
        process.exit(1);
    }
}

// Chama a função corretamente agora
executarFaxina();