const admin = require('firebase-admin');
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');

// 1. Configuração do Firebase (Use sua chave nova)
const serviceAccount = require("./firebase-key.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "maely-cristina-b0ce1.firebasestorage.app" // CONFIRA SE É ESTE MESMO
    });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function otimizarESubir(urlOriginal, pasta) {
    try {
        if (!urlOriginal || typeof urlOriginal !== 'string') return null;
        
        // Se já for uma imagem pequena (WebP), podemos pular para economizar processamento
        if (urlOriginal.includes('.webp')) {
            console.log(`⏩ Pulando ${urlOriginal} (já é WebP)`);
            return urlOriginal;
        }

        console.log(`- Baixando: ${urlOriginal}`);
        
        // Baixa a imagem
        const response = await axios({ url: urlOriginal, responseType: 'arraybuffer' });
        const bufferOriginal = Buffer.from(response.data, 'binary');

        // Define a largura baseada na pasta
        const width = (pasta === 'banners') ? 1920 : 1000;

        // Otimiza com Sharp
        const bufferOtimizado = await sharp(bufferOriginal)
            .resize({ width: width, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        // Nome do novo arquivo
        const novoNome = `${pasta}/otimizado-${Date.now()}-${Math.floor(Math.random() * 1000)}.webp`;
        const fileUpload = bucket.file(novoNome);

        // Sobe para o Firebase
        await fileUpload.save(bufferOtimizado, {
            metadata: { contentType: 'image/webp' }
        });

        await fileUpload.makePublic();
        return `https://storage.googleapis.com/${bucket.name}/${novoNome}`;

    } catch (error) {
        console.error(`❌ Erro ao processar imagem ${urlOriginal}:`, error.message);
        return urlOriginal; // Se der erro, mantém a original para não quebrar o site
    }
}

async function iniciarOtimizacao() {
    console.log("🚀 Iniciando Otimização em Massa...");

    // --- OTIMIZAR PRODUTOS ---
    console.log("\n📦 Processando PRODUTOS...");
    const prodsSnapshot = await db.collection('products').get();
    
    for (const doc of prodsSnapshot.docs) {
        const data = doc.data();
        let mudou = false;

        // Otimiza a array de imagens
        if (data.images && Array.isArray(data.images)) {
            const novasImagens = [];
            for (const imgUrl of data.images) {
                const novaUrl = await otimizarESubir(imgUrl, 'products');
                if (novaUrl !== imgUrl) mudou = true;
                novasImagens.push(novaUrl);
            }
            if (mudou) {
                await doc.ref.update({ 
                    images: novasImagens,
                    imageUrl: novasImagens[0] // Atualiza a capa também
                });
                console.log(`✅ Produto [${data.title}] atualizado.`);
            }
        }
    }

    // --- OTIMIZAR BANNERS ---
    console.log("\n🖼️ Processando BANNERS...");
    const bannersSnapshot = await db.collection('banners').get();

    for (const doc of bannersSnapshot.docs) {
        const data = doc.data();
        const novaUrlDesktop = await otimizarESubir(data.imageDesktop, 'banners');
        const novaUrlMobile = await otimizarESubir(data.imageMobile, 'banners');

        if (novaUrlDesktop !== data.imageDesktop || novaUrlMobile !== data.imageMobile) {
            await doc.ref.update({
                imageDesktop: novaUrlDesktop,
                imageMobile: novaUrlMobile
            });
            console.log(`✅ Banner atualizado.`);
        }
    }

    console.log("\n✨ TUDO PRONTO! Seu site agora está leve.");
    process.exit();
}

iniciarOtimizacao();