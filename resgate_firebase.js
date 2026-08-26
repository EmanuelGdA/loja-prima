const admin = require('firebase-admin');
const sharp = require('sharp');
const axios = require('axios');

// 1. Configuração do Firebase NOVO (Maely Cristina Oficial)
// Certifique-se de que este arquivo JSON está na pasta!
const serviceAccount = require("./firebase-key.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "maely-cristina-oficial.firebasestorage.app" 
    });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function processarESubir(urlOriginal, pasta) {
    try {
        if (!urlOriginal || typeof urlOriginal !== 'string') return null;

        // Se o link NÃO for do Firebase antigo, pula (evita mexer no que já está certo)
        if (!urlOriginal.includes('maely-cristina-b0ce1')) {
            return urlOriginal;
        }

        console.log(`🚚 Resgatando do Firebase Antigo: ${urlOriginal.split('/').pop().split('?')[0]}`);
        
        // Tenta baixar a imagem do servidor antigo do Google
        const response = await axios({ 
            url: urlOriginal, 
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 15000 
        });
        
        const bufferOriginal = Buffer.from(response.data, 'binary');

        // Otimiza com Sharp (Transforma os 10MB em 200KB)
        const width = (pasta === 'banners') ? 1920 : 1000;
        const bufferOtimizado = await sharp(bufferOriginal)
            .resize({ width: width, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        const novoNome = `${pasta}/resgatado-${Date.now()}.webp`;
        const fileUpload = bucket.file(novoNome);

        await fileUpload.save(bufferOtimizado, {
            metadata: { contentType: 'image/webp' }
        });

        await fileUpload.makePublic();
        const novaUrl = `https://storage.googleapis.com/${bucket.name}/${novoNome}`;
        console.log(`   ✅ Sucesso! Nova URL: ${novaUrl}`);
        return novaUrl;

    } catch (error) {
        console.error(`   ❌ Não consegui acessar a imagem antiga: ${error.message}`);
        return urlOriginal; // Mantém a antiga para não sumir o registro caso falhe
    }
}

async function iniciarResgate() {
    console.log("🚀 Iniciando Migração Automática de Imagens (Firebase -> Firebase)...");

    // --- PROCESSAR PRODUTOS ---
    const prodsSnapshot = await db.collection('products').get();
    console.log(`\n📦 Analisando ${prodsSnapshot.size} produtos...`);

    for (const doc of prodsSnapshot.docs) {
        const data = doc.data();
        let novasImagens = [];
        let houveMudanca = false;

        if (data.images && Array.isArray(data.images)) {
            for (const imgUrl of data.images) {
                const novaUrl = await processarESubir(imgUrl, 'products');
                novasImagens.push(novaUrl);
                if (novaUrl !== imgUrl) houveMudanca = true;
            }

            if (houveMudanca) {
                await doc.ref.update({ 
                    images: novasImagens,
                    imageUrl: novasImagens[0] 
                });
                console.log(`✨ [${data.title}] atualizado com fotos leves.`);
            }
        }
    }

    // --- PROCESSAR BANNERS ---
    console.log(`\n🖼️ Analisando banners...`);
    const bannersSnapshot = await db.collection('banners').get();
    for (const doc of bannersSnapshot.docs) {
        const data = doc.data();
        const novaUrlDesktop = await processarESubir(data.imageDesktop, 'banners');
        const novaUrlMobile = await processarESubir(data.imageMobile, 'banners');

        if (novaUrlDesktop !== data.imageDesktop || novaUrlMobile !== data.imageMobile) {
            await doc.ref.update({
                imageDesktop: novaUrlDesktop,
                imageMobile: novaUrlMobile
            });
            console.log(`✨ Banner atualizado.`);
        }
    }

    console.log("\n🏁 FIM DA OPERAÇÃO. Verifique o site!");
    process.exit();
}

iniciarResgate();