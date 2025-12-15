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
        console.log("Erro ao buscar produtos:", error);
        res.status(500).render('500', { pageTitle: 'Erro no Servidor' });
    }
};

exports.getProduct = async (req, res) => {
    const prodId = req.params.productId;
    try {
        const doc = await db.collection('products').doc(prodId).get();
        if (!doc.exists) {
            return res.status(404).render('404', { pageTitle: 'Produto não encontrado', path: '' });
        }
        const productData = doc.data();
        productData.id = doc.id;

        res.render('shop/product-detail', {
            pageTitle: productData.title,
            product: productData,
            path: '/produtos'
        });
    } catch (error) {
        console.log(error);
        res.status(500).send('Erro ao carregar produto');
    }
};

// ==========================================
// 2. CARRINHO DE COMPRAS
// ==========================================

exports.getCart = (req, res) => {
    const cart = req.session.cart || { items: [], totalQty: 0, totalPrice: 0 };
    res.render('shop/cart', {
        pageTitle: 'Sua Sacola',
        path: '/carrinho',
        cart: cart
    });
};

exports.postCart = async (req, res) => {
    const prodId = req.body.productId;
    const size = req.body.size;

    try {
        const doc = await db.collection('products').doc(prodId).get();
        if (!doc.exists) return res.redirect('/');
        
        const product = doc.data();

        if (!req.session.cart) {
            req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
        }
        const cart = req.session.cart;

        const existingItemIndex = cart.items.findIndex(item => item.productId === prodId && item.size === size);

        if (existingItemIndex >= 0) {
            cart.items[existingItemIndex].qty += 1;
        } else {
            cart.items.push({
                productId: prodId,
                title: product.title,
                price: parseFloat(product.price),
                imageUrl: product.imageUrl,
                size: size,
                qty: 1
            });
        }

        cart.totalQty += 1;
        cart.totalPrice += parseFloat(product.price);

        req.session.save(err => {
            if(err) console.log(err);
            res.redirect('/carrinho');
        });
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
// 3. CHECKOUT E PAGAMENTO (PAGSEGURO)
// ==========================================

exports.getCheckout = (req, res) => {
    if (!req.session.cart || req.session.cart.items.length === 0) {
        return res.redirect('/carrinho');
    }
    if (!req.session.isLoggedIn) {
        req.flash('error', 'Faça login para finalizar sua compra.');
        return req.session.save(() => res.redirect('/login'));
    }
    res.render('shop/checkout', {
        pageTitle: 'Finalizar Compra',
        path: '/checkout',
        cart: req.session.cart,
        user: req.session.user // Passamos o user para preencher o email
    });
};

exports.postOrder = async (req, res) => {
    try {
        const user = req.session.user;
        const cart = req.session.cart;
        const paymentMethod = req.body.paymentMethod;
        
        // Proteção contra CPF vazio (evita o erro undefined)
        const cpf = req.body.cpf ? req.body.cpf.trim() : '';

        if (!cart || cart.items.length === 0) return res.redirect('/carrinho');
        
        if (!cpf) {
            req.flash('error', 'O CPF é obrigatório para a Nota Fiscal e Pagamento.');
            return res.redirect('/checkout');
        }

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
            paymentMethod: paymentMethod === 'pix' ? 'PIX (PagSeguro)' : 'Cartão (PagSeguro)'
        };

        const orderRef = await db.collection('orders').add(orderData);
        const orderId = orderRef.id;

        // 2. Decide qual pagamento processar
        if (paymentMethod === 'pix') {
            // --- PIX ---
            const pixData = await paymentService.gerarPixPagSeguro(
                { id: orderId, totalPrice: cart.totalPrice }, 
                user, 
                cpf
            );

            // Transforma texto em Imagem QR Code
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
            // --- CARTÃO DE CRÉDITO ---
            const cardData = {
                number: req.body.cardNumber,
                holder: req.body.cardHolder,
                expiration: req.body.cardExpiration,
                cvv: req.body.cardCvv,
                installments: req.body.installments
            };

            const cardResult = await paymentService.processarCartaoPagSeguro(
                { id: orderId, totalPrice: cart.totalPrice }, 
                user, 
                cpf, 
                cardData
            );

            if (cardResult.status === 'PAID') {
                // Sucesso
                await orderRef.update({ 
                    status: 'Pago / Aprovado', 
                    pagseguroId: cardResult.id 
                });
                req.session.cart = null;
                return res.render('shop/success', { pageTitle: 'Compra Aprovada!', path: '' });
            } else {
                // Recusado
                await orderRef.update({ status: 'Recusado (' + cardResult.status + ')' });
                req.flash('error', 'Pagamento não aprovado: ' + cardResult.message);
                return res.redirect('/checkout');
            }
        }

    } catch (error) {
        console.log("ERRO CHECKOUT:", error);
        req.flash('error', 'Erro ao processar pagamento. Verifique os dados e o CPF.');
        res.redirect('/checkout');
    }
};

// ==========================================
// 4. ÁREA DO CLIENTE
// ==========================================

exports.getOrders = async (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/login');
    }

    try {
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