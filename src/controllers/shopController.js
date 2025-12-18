const db = require('../config/firebase');
const QRCode = require('qrcode');
const paymentService = require('../services/paymentService');

// ==========================================
// 1. VITRINE E PRODUTOS
// ==========================================

exports.getIndex = async (req, res) => {
    try {
        const snapshot = await db.collection('products').get();
        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('shop/home', {
            pageTitle: 'Home - Loja da Prima',
            products: products,
            path: '/'
        });
    } catch (error) {
        console.log("Erro Home:", error);
        res.render('shop/home', { pageTitle: 'Home', products: [], path: '/' });
    }
};

exports.getProduct = async (req, res) => {
    try {
        const prodId = req.params.productId;
        const doc = await db.collection('products').doc(prodId).get();
        
        if (!doc.exists) return res.redirect('/');
        
        const productData = doc.data();
        productData.id = doc.id;

        // 1. Busca Produtos Relacionados (Mesma categoria)
        const relatedSnapshot = await db.collection('products')
            .where('category', '==', productData.category)
            .limit(5) 
            .get();

        // Filtra para não mostrar o próprio produto que estamos vendo
        let relatedProducts = relatedSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => p.id !== prodId)
            .slice(0, 4); 

        // 2. Busca Avaliações
        const reviewsSnapshot = await db.collection('reviews')
            .where('productId', '==', prodId)
            .orderBy('date', 'desc')
            .get();
            
        const reviews = reviewsSnapshot.docs.map(doc => doc.data());

        res.render('shop/product-detail', {
            pageTitle: productData.title,
            product: productData,
            relatedProducts: relatedProducts,
            reviews: reviews,
            path: '/produtos'
        });
    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};

// ==========================================
// 2. CARRINHO
// ==========================================

exports.getCart = (req, res) => {
    const cart = req.session.cart || { items: [], totalQty: 0, totalPrice: 0 };
    res.render('shop/cart', { pageTitle: 'Sua Sacola', path: '/carrinho', cart: cart });
};

exports.postCart = async (req, res) => {
    try {
        const prodId = req.body.productId;
        const size = req.body.size;
        
        const doc = await db.collection('products').doc(prodId).get();
        if (!doc.exists) return res.redirect('/');
        const product = doc.data();

        if (!req.session.cart) req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
        const cart = req.session.cart;

        const existingItemIndex = cart.items.findIndex(item => item.productId === prodId && item.size === size);

        if (existingItemIndex >= 0) {
            cart.items[existingItemIndex].qty += 1;
        } else {
            cart.items.push({
                productId: prodId, title: product.title, price: parseFloat(product.price),
                imageUrl: product.imageUrl, size: size, qty: 1
            });
        }

        cart.totalQty += 1;
        cart.totalPrice += parseFloat(product.price);

        req.session.save(() => res.redirect('/carrinho'));
    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};

exports.postCartDeleteProduct = (req, res) => {
    const prodId = req.body.productId;
    const size = req.body.size;
    const cart = req.session.cart;
    if (!cart) return res.redirect('/carrinho');

    const itemIndex = cart.items.findIndex(item => item.productId === prodId && item.size === size);
    if (itemIndex >= 0) {
        const item = cart.items[itemIndex];
        cart.totalQty -= item.qty;
        cart.totalPrice -= (item.price * item.qty);
        cart.items.splice(itemIndex, 1);
    }
    req.session.save(() => res.redirect('/carrinho'));
};

// ==========================================
// 3. CHECKOUT E PEDIDO (SIMULAÇÃO)
// ==========================================

exports.getCheckout = (req, res) => {
    if (!req.session.cart || req.session.cart.items.length === 0) return res.redirect('/carrinho');
    if (!req.session.isLoggedIn) return res.redirect('/login');

    res.render('shop/checkout', {
        pageTitle: 'Finalizar Compra',
        path: '/checkout',
        cart: req.session.cart,
        user: req.session.user
    });
};

exports.postOrder = async (req, res) => {
    console.log("--- INICIANDO CRIAÇÃO DE PEDIDO ---");
    
    try {
        const user = req.session.user;
        const cart = req.session.cart;
        const paymentMethod = req.body.paymentMethod || 'pix'; // Padrão pix se vier vazio
        const cpf = req.body.cpf || '000.000.000-00'; // Simulação aceita qualquer coisa

        if (!cart || cart.items.length === 0) return res.redirect('/carrinho');

        // 1. Cria Pedido no Banco
        const orderData = {
            user: { id: user.id, email: user.email, name: user.name, cpf: cpf },
            items: cart.items,
            totalPrice: cart.totalPrice,
            address: {
                cep: req.body.cep, rua: req.body.rua, numero: req.body.numero,
                bairro: req.body.bairro, cidade: req.body.cidade, estado: req.body.estado
            },
            date: new Date().toISOString(),
            status: 'Aguardando Pagamento (Simulado)',
            paymentMethod: paymentMethod
        };

        const orderRef = await db.collection('orders').add(orderData);
        const orderId = orderRef.id;
        console.log("Pedido Criado no Firebase:", orderId);

        // 2. Processa Pagamento (Simulação)
        if (paymentMethod === 'pix') {
            
            // Chama o simulador
            const pixData = await paymentService.gerarPixPagSeguro({ id: orderId, totalPrice: cart.totalPrice }, user, cpf);
            
            // Gera QR Code Visual
            const qrCodeImage = await QRCode.toDataURL(pixData.qrCodeText);

            await orderRef.update({
                pagseguroId: pixData.id,
                pixCode: pixData.qrCodeText,
                status: 'Aguardando Pagamento'
            });

            req.session.cart = null;
            
            return res.render('shop/success-pix', { 
                pageTitle: 'Pagar com PIX', 
                path: '', 
                qrCodeImage: qrCodeImage, 
                pixCode: pixData.qrCodeText, 
                total: cart.totalPrice
            });

        } else {
            // Cartão (Simulado)
            const cardData = {
                number: req.body.cardNumber,
                holder: req.body.cardHolder,
                expiration: req.body.cardExpiration,
                cvv: req.body.cardCvv,
                installments: req.body.installments || 1
            };

            const cardResult = await paymentService.processarCartaoPagSeguro({ id: orderId, totalPrice: cart.totalPrice }, user, cpf, cardData);

            await orderRef.update({ status: 'Pago / Aprovado (Simulado)' });
            req.session.cart = null;
            return res.render('shop/success', { pageTitle: 'Compra Aprovada!', path: '' });
        }

    } catch (error) {
        console.error("ERRO GRAVE NO CHECKOUT:", error);
        req.flash('error', 'Erro interno no servidor. Tente novamente.');
        res.redirect('/checkout');
    }
};

// ==========================================
// 4. ÁREA DO CLIENTE
// ==========================================

exports.getOrders = async (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');

    try {
        const snapshot = await db.collection('orders').where('user.id', '==', req.session.user.id).get();
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('shop/orders', { pageTitle: 'Meus Pedidos', path: '/pedidos', orders: orders });
    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};

// ==========================================
// 5. NOVA FUNÇÃO PARA SALVAR AVALIAÇÃO
// ==========================================

exports.postReview = async (req, res) => {
    const user = req.session.user;
    const { productId, rating, comment } = req.body;

    if (!user) {
        // Se usar connect-flash:
        // req.flash('error', 'Você precisa estar logado para avaliar.');
        return res.redirect('/produto/' + productId);
    }

    try {
        const review = {
            productId: productId,
            userId: user.id,
            userName: user.name,
            rating: parseInt(rating),
            comment: comment,
            date: new Date().toISOString()
        };

        await db.collection('reviews').add(review);
        
        // req.flash('success', 'Avaliação enviada com sucesso!');
        res.redirect('/produto/' + productId);
    } catch (error) {
        console.log(error);
        res.redirect('/produto/' + productId);
    }
};

// ==========================================
// 6. FILTROS E BUSCA
// ==========================================

// Filtrar por Categoria (Ex: /colecao/vestidos)
exports.getCategory = async (req, res) => {
    const categoryName = req.params.categoryName; // Pega 'vestidos' da URL

    try {
        const snapshot = await db.collection('products')
            .where('category', '==', categoryName)
            .get();

        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('shop/home', { // Reutilizamos o visual da Home
            pageTitle: categoryName.charAt(0).toUpperCase() + categoryName.slice(1), // Capitaliza (Vestidos)
            products: products,
            path: '/colecao'
        });
    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};

// Buscar por Texto (Ex: ?q=vermelho)
exports.getSearch = async (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';

    try {
        // Firestore não tem busca nativa "LIKE %texto%". 
        // Para lojas pequenas, baixamos tudo e filtramos aqui no código. 
        // (Para lojas gigantes, usaríamos Algolia ou ElasticSearch).
        
        const snapshot = await db.collection('products').get();
        const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const filteredProducts = allProducts.filter(p => 
            p.title.toLowerCase().includes(query) || 
            (p.description && p.description.toLowerCase().includes(query))
        );

        res.render('shop/home', {
            pageTitle: `Busca: "${query}"`,
            products: filteredProducts,
            path: '/search'
        });
    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};