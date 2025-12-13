const db = require('../config/firebase');

exports.getIndex = async (req, res) => {
    try {
        // 1. Busca todos os documentos da coleção 'products'
        const snapshot = await db.collection('products').get();
        
        // 2. Transforma o resultado estranho do Firebase em um Array limpo de objetos
        const products = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // 3. Renderiza a Home enviando a lista de produtos
        res.render('shop/home', {
            pageTitle: 'Home - Loja da Prima',
            products: products, // Enviamos a lista para o EJS aqui
            path: '/'
        });

    } catch (error) {
        console.log("Erro ao buscar produtos:", error);
        res.status(500).render('500', { pageTitle: 'Erro no Servidor' });
    }
}

// ... (mantenha o getIndex lá em cima)

exports.getProduct = async (req, res) => {
    const prodId = req.params.productId; // Pega o ID que veio na URL

    try {
        const doc = await db.collection('products').doc(prodId).get();

        if (!doc.exists) {
            return res.status(404).render('404', { pageTitle: 'Produto não encontrado', path: '' });
        }

        const productData = doc.data();
        productData.id = doc.id; // Garante que o ID vai junto

        res.render('shop/product-detail', {
            pageTitle: productData.title,
            product: productData,
            path: '/produtos'
        });
    } catch (error) {
        console.log(error);
        res.status(500).send('Erro ao carregar produto');
    }
}

// ... (mantenha os imports e funções anteriores)

// 1. ADICIONAR AO CARRINHO (POST)
exports.postCart = async (req, res) => {
    const prodId = req.body.productId;
    const size = req.body.size; // Pegamos o tamanho escolhido (P, M, G)

    try {
        // Busca o produto no Firebase para garantir que o preço está certo
        const doc = await db.collection('products').doc(prodId).get();
        if (!doc.exists) return res.redirect('/');
        
        const product = doc.data();

        // Inicializa o carrinho na sessão se não existir
        if (!req.session.cart) {
            req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
        }

        const cart = req.session.cart;

        // Verifica se já tem esse produto COM ESSE TAMANHO no carrinho
        const existingItemIndex = cart.items.findIndex(item => item.productId === prodId && item.size === size);

        if (existingItemIndex >= 0) {
            // Se já tem, só aumenta a quantidade
            cart.items[existingItemIndex].qty += 1;
        } else {
            // Se não tem, adiciona novo
            cart.items.push({
                productId: prodId,
                title: product.title,
                price: parseFloat(product.price),
                imageUrl: product.imageUrl,
                size: size,
                qty: 1
            });
        }

        // Atualiza totais
        cart.totalQty += 1;
        cart.totalPrice += parseFloat(product.price);

        // Salva a sessão manualmente para garantir
        req.session.save(err => {
            if(err) console.log(err);
            res.redirect('/carrinho');
        });

    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};

// 2. MOSTRAR TELA DO CARRINHO (GET)
exports.getCart = (req, res) => {
    // Se não tiver carrinho, cria um vazio para não dar erro na tela
    const cart = req.session.cart || { items: [], totalQty: 0, totalPrice: 0 };

    res.render('shop/cart', {
        pageTitle: 'Sua Sacola',
        path: '/carrinho',
        cart: cart
    });
};

// 3. REMOVER ITEM (POST)
exports.postCartDeleteProduct = (req, res) => {
    const prodId = req.body.productId;
    const size = req.body.size;
    const cart = req.session.cart;

    if (!cart) return res.redirect('/carrinho');

    // Acha o item para saber o preço e quantidade
    const itemIndex = cart.items.findIndex(item => item.productId === prodId && item.size === size);
    
    if (itemIndex >= 0) {
        const item = cart.items[itemIndex];
        // Subtrai do total geral
        cart.totalQty -= item.qty;
        cart.totalPrice -= (item.price * item.qty);
        
        // Remove do array
        cart.items.splice(itemIndex, 1);
    }

    req.session.save(() => res.redirect('/carrinho'));
}

// ... (código anterior)

// 1. EXIBIR TELA DE CHECKOUT (GET)
exports.getCheckout = (req, res) => {
    // Se não tiver carrinho ou estiver vazio, chuta pra Home
    if (!req.session.cart || req.session.cart.items.length === 0) {
        return res.redirect('/carrinho');
    }

    // Se não estiver logado, manda fazer login
    if (!req.session.isLoggedIn) {
        req.flash('error', 'Faça login para finalizar sua compra.');
        return req.session.save(() => res.redirect('/login'));
    }

    res.render('shop/checkout', {
        pageTitle: 'Finalizar Compra',
        path: '/checkout',
        cart: req.session.cart
    });
};

// 2. FECHAR O PEDIDO (POST)
exports.postOrder = async (req, res) => {
    try {
        const user = req.session.user;
        const cart = req.session.cart;
        const paymentMethod = req.body.paymentMethod;
        const cpf = req.body.cpf; // PEGAMOS O CPF AQUI

        if (!cart || cart.items.length === 0) return res.redirect('/carrinho');

        // 1. Cria Pedido no Banco
        const orderData = {
            user: { id: user.id, email: user.email, name: user.name, cpf: cpf },
            items: cart.items,
            totalPrice: cart.totalPrice,
            address: {
                cep: req.body.cep,
                rua: req.body.rua,
                numero: req.body.numero,
                bairro: req.body.bairro,
                cidade: req.body.cidade,
                estado: req.body.estado
            },
            date: new Date().toISOString(),
            status: 'Aguardando Pagamento',
            paymentMethod: 'PIX (Mercado Pago)'
        };

        const orderRef = await db.collection('orders').add(orderData);
        const orderId = orderRef.id;

        // 2. Processa Pagamento (Apenas PIX por enquanto)
        if (paymentMethod === 'pix') {
            
            const pixData = await paymentService.gerarPixMercadoPago(
                { id: orderId, totalPrice: cart.totalPrice }, 
                user, 
                cpf
            );

            // Monta a imagem para o HTML (o MP já manda em base64)
            const qrCodeImage = `data:image/png;base64,${pixData.qrCodeBase64}`;

            // Atualiza pedido com dados do Pix
            await orderRef.update({
                mpTransactionId: pixData.id,
                pixCode: pixData.qrCode,
                status: 'Aguardando Pagamento'
            });

            req.session.cart = null; // Limpa carrinho
            
            return res.render('shop/success-pix', { 
                pageTitle: 'Pagar com PIX', 
                path: '', 
                qrCodeImage: qrCodeImage, 
                pixCode: pixData.qrCode, 
                total: cart.totalPrice
            });

        } else {
            // Se escolher cartão, avisamos que só Pix está ativo no momento
            // (Para cartão no MP precisaríamos de mais configurações de frontend)
            req.flash('error', 'No momento, escolha a opção PIX para aprovação imediata.');
            return res.redirect('/checkout');
        }

    } catch (error) {
        console.log(error);
        req.flash('error', 'Erro ao processar. Verifique se o CPF está correto.');
        res.redirect('/checkout');
    }
}



// 3. LISTAR MEUS PEDIDOS (GET)
exports.getOrders = async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }

    try {
        // Busca pedidos do usuário logado
        const snapshot = await db.collection('orders')
            .where('user.id', '==', req.session.user.id)
            .get();

        const orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.render('shop/orders', {
            pageTitle: 'Meus Pedidos',
            path: '/pedidos',
            orders: orders
        });

    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};