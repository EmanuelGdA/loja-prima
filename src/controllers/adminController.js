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

// 3. LISTAR TODOS OS PEDIDOS (Painel Admin)
exports.getOrders = async (req, res) => {
    try {
        // Busca TODOS os pedidos ordenados por data (mais recentes primeiro)
        const snapshot = await db.collection('orders').orderBy('date', 'desc').get();
        
        const orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

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

// 4. ATUALIZAR STATUS DO PEDIDO (Ex: Pendente -> Enviado)
exports.postUpdateStatus = async (req, res) => {
    const { orderId, status } = req.body;

    try {
        await db.collection('orders').doc(orderId).update({
            status: status
        });
        console.log(`Pedido ${orderId} atualizado para ${status}`);
        res.redirect('/admin/pedidos');
    } catch (error) {
        console.log(error);
        res.redirect('/admin/pedidos');
    }
};