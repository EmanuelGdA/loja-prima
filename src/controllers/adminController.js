const db = require('../config/firebase');

// ==========================================
// 1. FUNÇÕES DE ADICIONAR (JÁ EXISTIAM)
// ==========================================

exports.getAddProduct = (req, res) => {
    res.render('admin/edit-product', {
        pageTitle: 'Adicionar Produto',
        path: '/admin/adicionar-produto',
        editing: false
    });
};

exports.postAddProduct = async (req, res) => {
    try {
        const { title, imageUrl, price, description, category } = req.body;
        const newProduct = {
            title: title,
            imageUrl: imageUrl,
            price: parseFloat(price),
            description: description,
            category: category,
            createdAt: new Date().toISOString()
        };
        await db.collection('products').add(newProduct);
        console.log('Produto Criado!');
        res.redirect('/'); 
    } catch (error) {
        console.log(error);
        res.status(500).send("Erro ao salvar produto");
    }
};

// ==========================================
// 2. FUNÇÕES DE PEDIDOS (JÁ EXISTIAM)
// ==========================================

exports.getOrders = async (req, res) => {
    try {
        const snapshot = await db.collection('orders').orderBy('date', 'desc').get();
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('admin/orders', {
            pageTitle: 'Gerenciar Vendas',
            path: '/admin/pedidos',
            orders: orders
        });
    } catch (error) {
        console.log("Erro ao buscar pedidos:", error);
        res.redirect('/admin/dashboard');
    }
};

exports.postUpdateStatus = async (req, res) => {
    const { orderId, status } = req.body;
    try {
        await db.collection('orders').doc(orderId).update({ status: status });
        console.log(`Pedido ${orderId} atualizado para ${status}`);
        res.redirect('/admin/pedidos');
    } catch (error) {
        console.log(error);
        res.redirect('/admin/pedidos');
    }
};

// ==========================================
// 3. NOVAS FUNÇÕES (QUE ESTAVAM FALTANDO)
// ==========================================

// 5. LISTAR PRODUTOS (Para o Admin gerenciar)
exports.getProducts = async (req, res) => {
    try {
        const snapshot = await db.collection('products').get();
        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('admin/products', {
            pageTitle: 'Gerenciar Produtos',
            path: '/admin/produtos',
            products: products
        });
    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};

// 6. EXCLUIR PRODUTO
exports.postDeleteProduct = async (req, res) => {
    const prodId = req.body.productId;
    try {
        await db.collection('products').doc(prodId).delete();
        console.log('Produto Excluído');
        res.redirect('/admin/produtos');
    } catch (error) {
        console.log(error);
        res.redirect('/admin/produtos');
    }
};

// 7. CARREGAR TELA DE EDIÇÃO
exports.getEditProduct = async (req, res) => {
    const prodId = req.params.productId;
    try {
        const doc = await db.collection('products').doc(prodId).get();
        if (!doc.exists) return res.redirect('/admin/produtos');

        const product = doc.data();
        product.id = doc.id;

        res.render('admin/edit-product', {
            pageTitle: 'Editar Produto',
            path: '/admin/editar-produto',
            editing: true,
            product: product
        });
    } catch (error) {
        console.log(error);
        res.redirect('/admin/produtos');
    }
};

// 8. SALVAR A EDIÇÃO
exports.postEditProduct = async (req, res) => {
    const prodId = req.body.productId;
    try {
        const updatedProduct = {
            title: req.body.title,
            price: parseFloat(req.body.price),
            description: req.body.description,
            imageUrl: req.body.imageUrl,
            category: req.body.category
        };

        await db.collection('products').doc(prodId).update(updatedProduct);
        console.log('Produto Atualizado');
        res.redirect('/admin/produtos');
    } catch (error) {
        console.log(error);
        res.redirect('/admin/produtos');
    }
};