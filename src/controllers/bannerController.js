const { db, bucket } = require('../config/firebase'); // Importamos o db e o bucket
const path = require('path');

// --- FUNÇÃO AUXILIAR: Envia o arquivo para o Firebase Storage ---
async function uploadFile(file, folder) {
    return new Promise((resolve, reject) => {
        // Gera um nome único para o arquivo para evitar que um sobrescreva o outro
        const fileName = `${folder}/${Date.now()}-${file.originalname}`;
        const fileUpload = bucket.file(fileName);

        const stream = fileUpload.createWriteStream({
            metadata: {
                contentType: file.mimetype
            }
        });

        stream.on('error', (error) => {
            console.error("Erro no stream do Firebase:", error);
            reject(error);
        });

        stream.on('finish', async () => {
            try {
                // Torna o arquivo público para que o site consiga exibir
                await fileUpload.makePublic();
                // Monta a URL pública oficial do Google
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                resolve(publicUrl);
            } catch (err) {
                reject(err);
            }
        });

        // Envia os dados da imagem que estão na memória RAM (buffer) para o Firebase
        stream.end(file.buffer);
    });
}

// 1. LISTAR BANNERS
exports.getManageBanners = async (req, res) => {
    try {
        const snapshot = await db.collection('banners').orderBy('createdAt', 'desc').get();
        const banners = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.render('admin/manage-banners', {
            pageTitle: 'Gerenciar Banners',
            path: '/admin/banners',
            banners: banners,
            errorMessage: req.flash('error')[0] || null,
            successMessage: req.flash('success')[0] || null
        });
    } catch (error) {
        console.error("Erro ao listar banners:", error);
        res.redirect('/admin');
    }
};

// 2. ADICIONAR NOVO BANNER (AGORA NO FIREBASE)
exports.postAddBanner = async (req, res) => {
    try {
        const snapshot = await db.collection('banners').get();
        if (snapshot.size >= 5) {
            req.flash('error', 'Limite de 5 banners atingido. Exclua um antes de adicionar outro.');
            return res.redirect('/admin/banners');
        }

        // Verifica se pelo menos UMA imagem foi enviada no formulário
        if (!req.files || (!req.files.imageDesktop && !req.files.imageMobile)) {
            req.flash('error', 'Você precisa selecionar pelo menos uma imagem (PC ou Celular).');
            return res.redirect('/admin/banners');
        }

        let urlDesktop = null;
        let urlMobile = null;

        // Faz o upload para o Firebase apenas se o arquivo existir
        if (req.files.imageDesktop) {
            urlDesktop = await uploadFile(req.files.imageDesktop[0], 'banners');
        }
        if (req.files.imageMobile) {
            urlMobile = await uploadFile(req.files.imageMobile[0], 'banners');
        }

        // LÓGICA DE BACKUP: Se enviou só um, usa o mesmo para o outro dispositivo
        const newBanner = {
            imageDesktop: urlDesktop || urlMobile,
            imageMobile: urlMobile || urlDesktop,
            link: req.body.link || '/',
            createdAt: new Date().toISOString()
        };

        await db.collection('banners').add(newBanner);

        req.flash('success', 'Banner salvo no Firebase com sucesso! 🚀');
        res.redirect('/admin/banners');

    } catch (error) {
        console.error("Erro ao adicionar banner:", error);
        req.flash('error', 'Ocorreu um erro ao processar o upload para o Firebase.');
        res.redirect('/admin/banners');
    }
};

// 3. EXCLUIR BANNER (VERSÃO FINAL COM LIMPEZA FÍSICA NO STORAGE)
exports.postDeleteBanner = async (req, res) => {
    const bannerId = req.body.bannerId;

    try {
        // 1. Busca os dados do banner para saber quais fotos ele tem antes de apagar
        const doc = await db.collection('banners').doc(bannerId).get();
        
        if (doc.exists) {
            const data = doc.data();
            // Criamos uma lista com os dois campos de imagem
            const imagensParaRemover = [data.imageDesktop, data.imageMobile];

            for (const url of imagensParaRemover) {
                try {
                    // Só tenta apagar se o link for do Firebase Storage (ignora Cloudinary antigo)
                    if (url && url.includes('storage.googleapis.com')) {
                        // Extrai o caminho do arquivo (ex: banners/1715000-foto.jpg)
                        const parts = url.split(`${bucket.name}/`);
                        if (parts.length > 1) {
                            const fileName = parts[1];
                            // Remove o arquivo do Google Storage
                            await bucket.file(fileName).delete();
                            console.log("✅ Imagem de banner removida do Storage:", fileName);
                        }
                    }
                } catch (err) {
                    // Se o arquivo não existir mais no Storage, apenas avisa e continua
                    console.log("⚠️ Arquivo de banner não encontrado no Storage, pulando...");
                }
            }
        }

        // 2. Agora sim, apaga o registro do banco de dados
        await db.collection('banners').doc(bannerId).delete();
        
        req.flash('success', 'Banner e imagens removidos com sucesso! 🧹');
        res.redirect('/admin/banners');

    } catch (error) {
        console.error("❌ Erro ao excluir banner:", error);
        req.flash('error', 'Não foi possível excluir o banner.');
        res.redirect('/admin/banners');
    }
};