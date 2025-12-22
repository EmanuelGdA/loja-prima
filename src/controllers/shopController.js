const shippingService = require('../services/shippingService');
const  db   = require('../config/firebase');
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
    console.log("--- INICIANDO PEDIDO ---");
    try {
        const user = req.session.user;
        const cart = req.session.cart;
        const paymentMethod = req.body.paymentMethod;
        const cpf = req.body.cpf ? req.body.cpf.trim() : '';
        
        // --- NOVO: PEGAR DADOS DO FRETE ---
        const shippingCost = parseFloat(req.body.shippingCost) || 0;
        const shippingMethod = req.body.shippingMethod || 'A combinar';

        if (!cart || cart.items.length === 0) return res.redirect('/carrinho');
        if (!cpf) {
            req.flash('error', 'CPF Obrigatório.');
            return res.redirect('/checkout');
        }

        // CÁLCULO DO TOTAL FINAL (Produtos + Frete)
        const finalTotalPrice = cart.totalPrice + shippingCost;

        const orderData = {
            user: { id: user.id, email: user.email, name: user.name, cpf: cpf },
            items: cart.items,
            subtotal: cart.totalPrice, // Guardamos o subtotal
            shippingCost: shippingCost, // Guardamos o valor do frete
            shippingMethod: shippingMethod, // Ex: "Loggi Express"
            totalPrice: finalTotalPrice, // TOTAL COM FRETE
            address: {
                cep: req.body.cep, rua: req.body.rua, numero: req.body.numero,
                bairro: req.body.bairro, cidade: req.body.cidade, estado: req.body.estado
            },
            date: new Date().toISOString(),
            status: 'Aguardando Pagamento',
            paymentMethod: paymentMethod
        };

        const orderRef = await db.collection('orders').add(orderData);
        const orderId = orderRef.id;

        // Agora passamos o 'totalPrice' atualizado (com frete) para o PagSeguro
        if (paymentMethod === 'pix') {
            const pixData = await paymentService.gerarPixPagSeguro(
                { id: orderId, totalPrice: finalTotalPrice }, // <--- Valor atualizado
                user, cpf
            );
            // ... resto do código igual ...
            const qrCodeImage = await QRCode.toDataURL(pixData.qrCodeText);
            await orderRef.update({ pagseguroId: pixData.id, pixCode: pixData.qrCodeText, status: 'Aguardando Pagamento' });
            req.session.cart = null;
            return res.render('shop/success-pix', { pageTitle: 'Pagar com PIX', path: '', qrCodeImage, pixCode: pixData.qrCodeText, total: finalTotalPrice });

        } else {
            // Cartão
            const cardData = { /* ... */ }; // (pegue do código anterior)
            // Lembre de passar 'finalTotalPrice' para o serviço do cartão também!
            // ...
        }
        
        // ... (resto do código igual) ...

    } catch (error) {
        console.error("ERRO CHECKOUT:", error);
        // ...
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

// --- CÁLCULO DE FRETE (API) ---
exports.postCalculateShipping = async (req, res) => {
    const { cep, productId } = req.body;

    try {
        let produtosParaCalculo = [];

        // Se veio um ID (Página de Produto), calcula só ele
        if (productId) {
            const doc = await db.collection('products').doc(productId).get();
            if (doc.exists) {
                const prod = doc.data();
                prod.id = doc.id;
                produtosParaCalculo.push(prod);
            }
        } 
        // Se NÃO veio ID (Página de Checkout), calcula o Carrinho todo
        else if (req.session.cart && req.session.cart.items.length > 0) {
            // O Melhor Envio precisa de altura/largura. Como não temos no carrinho,
            // vamos pegar do banco ou usar padrão para cada item
            // Simplificação: Vamos usar os dados que já estão no carrinho + padrão
            produtosParaCalculo = req.session.cart.items.map(item => ({
                id: item.productId,
                price: item.price,
                width: 20, height: 5, length: 20, weight: 0.3, // Padrão
                quantity: item.qty
            }));
        }

        if (produtosParaCalculo.length === 0) {
            return res.status(400).json({ error: 'Nenhum produto para calcular' });
        }

        // Chama o serviço do Melhor Envio
        const opcoesFrete = await shippingService.calcularFrete(cep, produtosParaCalculo);

        res.json(opcoesFrete);

    } catch (error) {
        console.log("Erro Frete:", error.message);
        res.status(500).json({ error: 'Erro ao calcular frete' });
    }
};