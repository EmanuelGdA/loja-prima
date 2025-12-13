const db = require('../config/firebase');

// 1. Mostrar o formulário de adicionar produto
exports.getAddProduct = (req, res) => {
    res.render('admin/edit-product', {
        pageTitle: 'Adicionar Produto',
        path: '/admin/adicionar-produto',
        editing: false
    });
};

// 2. Receber os dados do formulário e salvar no Firebase
exports.postAddProduct = async (req, res) => {
    try {
        const { title, imageUrl, price, description, category } = req.body;

        const newProduct = {
            title: title,
            imageUrl: imageUrl, // Por enquanto vamos usar Links de imagens
            price: parseFloat(price),
            description: description,
            category: category,
            createdAt: new Date().toISOString()
        };

        // Salva na coleção 'products'
        await db.collection('products').add(newProduct);
        
        console.log('Produto Criado!');
        res.redirect('/'); // Volta para a Home após salvar
    } catch (error) {
        console.log(error);
        res.status(500).send("Erro ao salvar produto");
    }
};