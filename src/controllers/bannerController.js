const { db } = require('../config/firebase');

// 1. LISTAR BANNERS (Tela de Gerenciamento)
exports.getManageBanners = async (req, res) => {
    try {
        // Busca todos os banners ordenados pelo mais novo
        const snapshot = await db.collection('banners').orderBy('createdAt', 'desc').get();
        const banners = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.render('admin/manage-banners', {
            pageTitle: 'Gerenciar Banners',
            path: '/admin/banners',
            banners: banners,
            // Captura mensagens de erro ou sucesso (flash)
            errorMessage: req.flash('error')[0] || null,
            successMessage: req.flash('success')[0] || null
        });
    } catch (error) {
        console.error("Erro ao listar banners:", error);
        res.redirect('/admin');
    }
};

// 2. ADICIONAR NOVO BANNER (Lógica Flexível)
exports.postAddBanner = async (req, res) => {
    try {
        // Trava de segurança: Máximo 5 banners
        const snapshot = await db.collection('banners').get();
        if (snapshot.size >= 5) {
            req.flash('error', 'Limite de 5 banners atingido. Exclua um antes de adicionar outro.');
            return res.redirect('/admin/banners');
        }

        // Verifica se pelo menos UMA imagem foi enviada
        if (!req.files || (!req.files.imageDesktop && !req.files.imageMobile)) {
            req.flash('error', 'Você precisa selecionar pelo menos uma imagem (PC ou Celular).');
            return res.redirect('/admin/banners');
        }

        // Pega os caminhos gerados pelo Cloudinary
        const pathDesktop = req.files.imageDesktop ? req.files.imageDesktop[0].path : null;
        const pathMobile = req.files.imageMobile ? req.files.imageMobile[0].path : null;

        // LÓGICA INTELIGENTE: 
        // Se a cliente subir só o de PC, o Mobile recebe a mesma imagem.
        // Se subir só o de Celular, o PC recebe a mesma imagem.
        const newBanner = {
    // Salvamos apenas o que foi enviado de fato
    imageDesktop: req.files.imageDesktop ? req.files.imageDesktop[0].path : null,
    imageMobile: req.files.imageMobile ? req.files.imageMobile[0].path : null,
    link: req.body.link || '/',
    createdAt: new Date().toISOString()
};

        // Salva no Firebase
        await db.collection('banners').add(newBanner);

        req.flash('success', 'Banner publicado com sucesso!');
        res.redirect('/admin/banners');

    } catch (error) {
        console.error("Erro ao adicionar banner:", error);
        req.flash('error', 'Ocorreu um erro ao processar o upload das imagens.');
        res.redirect('/admin/banners');
    }
};

// 3. EXCLUIR BANNER
exports.postDeleteBanner = async (req, res) => {
    const bannerId = req.body.bannerId;

    try {
        // Deleta o documento do Firebase
        await db.collection('banners').doc(bannerId).delete();
        
        // Nota: As imagens continuarão no Cloudinary, mas o site não as verá mais.
        // Para deletar do Cloudinary também, seria necessário o ID da imagem.
        
        req.flash('success', 'Banner removido com sucesso!');
        res.redirect('/admin/banners');
    } catch (error) {
        console.error("Erro ao excluir banner:", error);
        req.flash('error', 'Não foi possível excluir o banner.');
        res.redirect('/admin/banners');
    }
};