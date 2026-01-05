const shippingService = require('../services/shippingService');
const  { db }  = require('../config/firebase');
const QRCode = require('qrcode');
const paymentService = require('../services/paymentService');
const admin = require('firebase-admin'); 

// ==========================================
// 1. VITRINE E PRODUTOS
// ==========================================

exports.getIndex = async (req, res) => {
    try {
        const snapshot = await db.collection('products').get();
        // Mapeia e já converte textos para números para evitar erros
        const products = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Garante que preço é número (se não for, vira 0)
                price: parseFloat(data.price) || 0,
                originalPrice: parseFloat(data.originalPrice) || 0,
                promoPrice: parseFloat(data.promoPrice) || 0
            };
        });

        res.render('shop/home', {
            pageTitle: 'Home - Maely Cristina',
            products: products,
            path: '/'
        });
    } catch (error) {
        console.log("Erro ao buscar produtos:", error);
        res.status(500).render('500', { pageTitle: 'Erro no Servidor' });
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
        const color = req.body.color; // <--- PEGA A COR DO FORMULÁRIO

        const doc = await db.collection('products').doc(prodId).get();
        if (!doc.exists) return res.redirect('/');
        const product = doc.data();

        if (!req.session.cart) req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
        const cart = req.session.cart;

        // Verifica se já existe esse produto com ESSE tamanho E ESSA cor
        const existingItemIndex = cart.items.findIndex(item => 
            item.productId === prodId && 
            item.size === size && 
            item.color === color
        );

        if (existingItemIndex >= 0) {
            cart.items[existingItemIndex].qty += 1;
        } else {
            cart.items.push({
                productId: prodId, 
                title: product.title, 
                price: parseFloat(product.price),
                imageUrl: product.imageUrl, 
                size: size, 
                color: color || 'Única', // <--- SALVA A COR (ou "Única" se não tiver)
                qty: 1
            });
        }

        cart.totalQty += 1;
        cart.totalPrice += parseFloat(product.price);

       // --- SALVA NO BANCO SE ESTIVER LOGADO ---
        if (req.session.user) {
            await db.collection('users').doc(req.session.user.id).update({
                cart: cart // Salva o objeto do carrinho inteiro no usuário
            }).catch(e => console.log("Erro ao salvar carrinho no banco", e));
        }
        // ----------------------------------------

        req.session.save(err => {
            if(err) console.log(err);
            res.redirect('/carrinho');
        });

        } catch (error) { // <--- AQUI ESTAVA FALTANDO O FECHAMENTO
        console.log(error);
        res.redirect('/');
    }
};
        
    

exports.postCartDeleteProduct = async (req, res) => {
    const prodId = req.body.productId;
    const size = req.body.size;
    const color = req.body.color; // <--- Pega a cor do formulário
    
    const cart = req.session.cart;

    if (!cart) return res.redirect('/carrinho');

    // Procura o item que tenha ID, Tamanho E Cor iguais
    const itemIndex = cart.items.findIndex(item => 
        item.productId === prodId && 
        item.size === size &&
        (item.color || '') === color // Compara a cor (trata vazios)
    );
    
    if (itemIndex >= 0) {
        const item = cart.items[itemIndex];
        // Subtrai do total geral
        cart.totalQty -= item.qty;
        cart.totalPrice -= (item.price * item.qty);
        
        // Remove do array
        cart.items.splice(itemIndex, 1);
    }

    // --- SALVA NO BANCO SE ESTIVER LOGADO ---
    if (req.session.user) {
        await db.collection('users').doc(req.session.user.id).update({
            cart: cart
        }).catch(e => console.log("Erro ao atualizar carrinho", e));
    }
    // ----------------------------------------

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
    
    // 1. LOG DE DEPURAÇÃO (Para ver o que chega do formulário)
    // Isso vai aparecer no seu terminal e nos logs do Render
    console.log("MÉTODO:", req.body.paymentMethod);
    console.log("DADOS RECEBIDOS:", JSON.stringify(req.body, null, 2));

    try {
        const user = req.session.user;
        const cart = req.session.cart;
        const paymentMethod = req.body.paymentMethod;
        
        // Limpeza de CPF e Telefone
        const cpf = req.body.cpf ? req.body.cpf.replace(/\D/g, '') : '';
        const phone = req.body.phone ? req.body.phone.replace(/\D/g, '') : '';

        // Frete
        const shippingCost = parseFloat(req.body.shippingCost) || 0;
        const shippingMethod = req.body.shippingMethod || 'A combinar';

        // Validações Básicas
        if (!cart || cart.items.length === 0) return res.redirect('/carrinho');
        if (!cpf) {
            req.flash('error', 'CPF é obrigatório.');
            return res.redirect('/checkout');
        }

        // Atualiza usuário no banco (se tiver telefone novo)
        if (user && user.id) {
             await db.collection('users').doc(user.id).update({ cpf, phone }).catch(() => {});
        }

        // Cálculo Total
        const priceBase = cart.totalWithDiscount || cart.totalPrice;
        const finalTotalPrice = priceBase + shippingCost;

        // Monta Pedido
        const orderData = {
            user: { id: user.id, email: user.email, name: user.name, cpf, phone },
            items: cart.items,
            subtotal: cart.totalPrice,
            discountTotal: cart.totalWithDiscount || cart.totalPrice,
            shippingCost, shippingMethod,
            couponUsed: cart.coupon ? cart.coupon.code : null,
            totalPrice: finalTotalPrice,
            address: {
                cep: req.body.cep, rua: req.body.rua, numero: req.body.numero,
                bairro: req.body.bairro, cidade: req.body.cidade, estado: req.body.estado
            },
            date: new Date().toISOString(),
            status: 'Aguardando Pagamento',
            paymentMethod: paymentMethod === 'pix' ? 'PIX' : 'Cartão de Crédito'
        };

        const orderRef = await db.collection('orders').add(orderData);
        const orderId = orderRef.id;

        // 3. PAGAMENTO
        if (paymentMethod === 'pix') {
            // Lógica do Pix
            const pixData = await paymentService.gerarPixPagSeguro(
                { id: orderId, totalPrice: finalTotalPrice }, 
                { ...user, phone }, cpf
            );
            const qrCodeImage = await QRCode.toDataURL(pixData.qrCodeText);
            await orderRef.update({ pagseguroId: pixData.id, pixCode: pixData.qrCodeText });
            req.session.cart = null;
            return res.render('shop/success-pix', { pageTitle: 'Pagar com PIX', path: '', qrCodeImage, pixCode: pixData.qrCodeText, total: finalTotalPrice });
        } else {
            // --- CARTÃO MERCADO PAGO ---
            const cardToken = req.body.cardToken;
            const paymentMethodId = req.body.paymentMethodId; // ex: visa
            const installments = req.body.installments;

            if (!cardToken) throw new Error("Erro ao processar cartão (Token inválido).");

            const cardResult = await paymentService.processarCartaoPagSeguro(
                { id: orderId, totalPrice: finalTotalPrice }, 
                user, 
                cpf, 
                cardToken, 
                installments,
                paymentMethodId
            );

            if (cardResult.status === 'Pago / Aprovado') {
                await orderRef.update({ status: 'Pago / Aprovado', pagseguroId: cardResult.id });
                req.session.cart = null;
                return res.render('shop/success', { pageTitle: 'Compra Aprovada!', path: '' });
            } else {
                await orderRef.update({ status: 'Recusado' });
                req.flash('error', 'Pagamento não aprovado. Motivo: ' + (cardResult.message || 'Banco recusou'));
                return res.redirect('/checkout');
            }
        }
        
    } catch (error) {
        console.error("ERRO NO CHECKOUT (PostOrder):", error);
        req.flash('error', 'Erro ao processar: ' + error.message);
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

// Filtrar por Categoria (COM FILTROS AVANÇADOS)
exports.getCategory = async (req, res) => {
    const categoryName = req.params.categoryName;
    
    // 1. Pega os filtros da URL (ex: ?ordem=menor&tamanho=M)
    const { ordem, tamanho } = req.query;

    try {
        const snapshot = await db.collection('products')
            .where('category', '==', categoryName)
            .get();

        let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. FILTRO DE TAMANHO (Javascript puro)
        if (tamanho) {
            // Só deixa passar produtos que tenham o tamanho escolhido na lista de sizes
            products = products.filter(p => p.sizes && p.sizes.includes(tamanho));
        }

        // 3. ORDENAÇÃO DE PREÇO
        if (ordem === 'menor') {
            products.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        } else if (ordem === 'maior') {
            products.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        } else {
            // Padrão: Mais recentes primeiro (se tiver data)
            products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        res.render('shop/home', { 
            pageTitle: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
            products: products,
            path: '/colecao',
            
            // 4. IMPORTANTE: Envia os filtros de volta para a tela 
            // (para o select continuar marcado na opção certa)
            activeFilters: { ordem, tamanho }
        });
    } catch (error) {
        console.log("Erro na categoria:", error);
        res.redirect('/');
    }
};

// Buscar por Texto (Agora olha Título, Descrição, Categoria e Subcategoria)
exports.getSearch = async (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';

    try {
        const snapshot = await db.collection('products').get();
        const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const filteredProducts = allProducts.filter(p => {
            // Verifica se a palavra buscada existe em algum desses lugares:
            const inTitle = p.title.toLowerCase().includes(query);
            const inDesc = p.description && p.description.toLowerCase().includes(query);
            const inCat = p.category && p.category.toLowerCase().includes(query);
            const inSub = p.subcategory && p.subcategory.toLowerCase().includes(query);

            // Se encontrar em QUALQUER um, retorna o produto
            return inTitle || inDesc || inCat || inSub;
        });

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

// ==========================================
// 7. CUPONS DE DESCONTO (LÓGICA)
// ==========================================

exports.postApplyCoupon = async (req, res) => {
    // Garante que o código venha limpo e maiúsculo
    const code = req.body.couponCode ? req.body.couponCode.trim().toUpperCase() : '';
    const cart = req.session.cart;

    if (!cart) return res.redirect('/carrinho');

    try {
        // Busca o cupom no banco
        const doc = await db.collection('coupons').doc(code).get();

        // 1. Verifica se existe
        if (!doc.exists) {
            req.flash('error', 'Cupom inválido.');
            return res.redirect('/carrinho');
        }

        const couponData = doc.data();

        // 2. Verifica Validade (Data)
        const now = new Date();
        const expiresAt = new Date(couponData.expiresAt); 

        if (now > expiresAt) {
            req.flash('error', `Este cupom venceu em ${expiresAt.toLocaleDateString('pt-BR')}.`);
            return res.redirect('/carrinho');
        }

        // 3. Aplica o Desconto
        const discountPercent = couponData.discount; 
        const discountFactor = (100 - discountPercent) / 100;
        
        cart.coupon = {
            code: code,
            percent: discountPercent
        };
        
        // Calcula o novo total com desconto
        cart.totalWithDiscount = cart.totalPrice * discountFactor;

        req.session.save(() => {
            req.flash('success', `Cupom ${code} aplicado (-${discountPercent}%)!`);
            res.redirect('/carrinho');
        });

    } catch (error) {
        console.log(error);
        res.redirect('/carrinho');
    }
};

exports.postRemoveCoupon = (req, res) => {
    const cart = req.session.cart;
    if (cart) {
        delete cart.coupon;
        delete cart.totalWithDiscount;
    }
    req.session.save(() => {
        req.flash('success', 'Cupom removido.');
        res.redirect('/carrinho');
    });
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

// ==========================================
// 8. PÁGINA DE LANÇAMENTOS (ÚLTIMOS 7 DIAS)
// ==========================================

exports.getNewArrivals = async (req, res) => {
    try {
        // 1. Calcula a data de 7 dias atrás
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - 7); // Hoje menos 7 dias

        // 2. Busca todos os produtos
        // (Fazemos o filtro no JavaScript para evitar erros de índice no Firebase)
        const snapshot = await db.collection('products').get();
        const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 3. Filtra: Só passa quem tem data de criação maior que a data limite
        const newProducts = allProducts.filter(p => {
            if (!p.createdAt) return false; // Se for produto antigo sem data, ignora
            const productDate = new Date(p.createdAt);
            return productDate >= dateLimit;
        });
        
        // Ordena do mais recente para o mais antigo
        newProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 4. Renderiza usando o visual da Home
        res.render('shop/home', {
            pageTitle: 'Lançamentos da Semana',
            products: newProducts,
            path: '/colecao/lancamentos' // Para o menu saber onde estamos
        });

    } catch (error) {
        console.log("Erro Lançamentos:", error);
        res.redirect('/');
    }
};

// ==========================================
// 9. PÁGINA DE PROMOÇÕES
// ==========================================

exports.getPromotions = async (req, res) => {
    try {
        const snapshot = await db.collection('products').get();
        const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filtra apenas produtos que têm preço promocional válido
        // E o preço promo tem que ser menor que o original (senão não é promoção!)
        const promoProducts = allProducts.filter(p => {
            const promo = parseFloat(p.promoPrice);
            const original = parseFloat(p.originalPrice);
            return promo > 0 && promo < original;
        });

        res.render('shop/home', {
            pageTitle: 'Ofertas Imperdíveis', // Título que vai aparecer na página
            products: promoProducts,
            path: '/colecao/promocao'
        });

    } catch (error) {
        console.log("Erro Promoções:", error);
        res.redirect('/');
    }
};

// ==========================================
// 10. PÁGINAS INSTITUCIONAIS (Texto)
// ==========================================

exports.getInstitucional = (req, res) => {
    const page = req.params.page; // Pega o nome da página da URL
    
    let title = '';
    let content = '';

    // Define o conteúdo baseado no link
    switch(page) {
        case 'trocas':
            title = 'Trocas e Devoluções';
            content = '<p>Aqui na Maely Cristina, queremos que você ame sua peça! <br> Se precisar trocar, você tem até 7 dias após o recebimento...</p>';
            break;
        case 'entrega':
            title = 'Política de Entrega';
            content = '<p>Enviamos para todo o Brasil via Correios e Transportadoras...</p>';
            break;
        case 'contato':
            title = 'Fale Conosco';
            content = '<p>WhatsApp: (41) 99681-3385 <br> E-mail: contato@maelycristina.com.br</p>';
            break;
        default:
            return res.redirect('/');
    }

    res.render('shop/text-page', {
        pageTitle: title,
        path: '/' + page,
        title: title,
        content: content
    });
};

// ==========================================
// 11. ÁREA DE FAVORITOS
// ==========================================

// 1. Renderiza a página (o esqueleto)
exports.getFavoritesPage = (req, res) => {
    res.render('shop/favorites', {
        pageTitle: 'Meus Favoritos',
        path: '/favoritos'
    });
};

// 2. API: Recebe uma lista de IDs e devolve os dados dos produtos
exports.postGetFavoriteProducts = async (req, res) => {
    const ids = req.body.ids || [];

    if (ids.length === 0) {
        return res.json([]);
    }

    try {
        // O Firestore tem um limite para buscar vários IDs ("IN" query).
        // Se tiver muitos favoritos, pegamos os 10 primeiros por segurança.
        const safeIds = ids.slice(0, 10); 

        const snapshot = await db.collection('products')
            .where(admin.firestore.FieldPath.documentId(), 'in', safeIds)
            .get();

        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        res.json(products);

    } catch (error) {
        console.log("Erro ao buscar favoritos:", error);
        res.status(500).json({ error: 'Erro ao buscar favoritos' });
    }
};

// ==========================================
// 12. SINCRONIZAÇÃO DE FAVORITOS (BANCO DE DADOS)
// ==========================================

// Salvar/Remover Favorito no Firebase
exports.postToggleFavoriteAPI = async (req, res) => {
    if (!req.session.isLoggedIn) return res.json({ status: 'ignored' }); // Se não tá logado, só salva local

    const userId = req.session.user.id;
    const prodId = req.body.productId;

    try {
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();
        let favs = doc.data().favorites || [];

        if (favs.includes(prodId)) {
            // Remove
            await userRef.update({
                favorites: admin.firestore.FieldValue.arrayRemove(prodId)
            });
            res.json({ status: 'removed' });
        } else {
            // Adiciona
            await userRef.update({
                favorites: admin.firestore.FieldValue.arrayUnion(prodId)
            });
            res.json({ status: 'added' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao salvar favorito' });
    }
};

// Ler Favoritos do Usuário (Para restaurar ao logar)
exports.getUserFavoritesAPI = async (req, res) => {
    if (!req.session.isLoggedIn) return res.json([]);

    try {
        const doc = await db.collection('users').doc(req.session.user.id).get();
        const favs = doc.data().favorites || [];
        res.json(favs);
    } catch (error) {
        console.error(error);
        res.json([]);
    }
};

// ==========================================
// 13. PAGAMENTO TARDIO (RE-PAGAR)
// ==========================================

// Tela de escolher pagamento novamente
exports.getPayOrder = async (req, res) => {
    const orderId = req.params.orderId;
    try {
        const doc = await db.collection('orders').doc(orderId).get();
        if (!doc.exists) return res.redirect('/pedidos');
        
        const order = doc.data();
        order.id = doc.id;

        // Segurança: Só o dono do pedido pode pagar
        if (order.user.id !== req.session.user.id) {
            return res.redirect('/pedidos');
        }

        res.render('shop/payment', {
            pageTitle: 'Realizar Pagamento',
            order: order
        });
    } catch (error) {
        console.log(error);
        res.redirect('/pedidos');
    }
};

// Processar o novo pagamento
exports.postPayOrder = async (req, res) => {
    const orderId = req.params.orderId;
    const paymentMethod = req.body.paymentMethod;

    try {
        const orderRef = db.collection('orders').doc(orderId);
        const doc = await orderRef.get();
        const order = doc.data();
        order.id = doc.id;

        // Recupera o usuário atualizado (com CPF e dados)
        const user = req.session.user; 
        
        // Verifica CPF no pedido antigo ou na sessão
        const cpf = req.body.cpf || user.cpf || order.user.cpf; 

        if (paymentMethod === 'pix') {
            const pixData = await paymentService.gerarPixPagSeguro(
                { id: orderId, totalPrice: order.totalPrice }, 
                user, cpf
            );
            const qrCodeImage = await QRCode.toDataURL(pixData.qrCodeText);

            await orderRef.update({
                paymentMethod: 'PIX (Re-tentativa)',
                pagseguroId: pixData.id,
                pixCode: pixData.qrCodeText,
                status: 'Aguardando Pagamento'
            });

            return res.render('shop/success-pix', { 
                pageTitle: 'Pagar com PIX', path: '', 
                qrCodeImage, pixCode: pixData.qrCodeText, total: order.totalPrice 
            });

        } else {
            // Cartão
            const cardData = {
                number: req.body.cardNumber,
                holder: req.body.cardHolder,
                expiration: req.body.cardExpiration,
                cvv: req.body.cardCvv,
                installments: req.body.installments
            };
            const cardResult = await paymentService.processarCartaoPagSeguro(
                { id: orderId, totalPrice: order.totalPrice }, user, cpf, cardData
            );

            if (cardResult.status === 'PAID') {
                await orderRef.update({ 
                    status: 'Pago / Aprovado', 
                    paymentMethod: 'Cartão (Re-tentativa)',
                    pagseguroId: cardResult.id 
                });
                return res.render('shop/success', { pageTitle: 'Sucesso', path: '' });
            } else {
                req.flash('error', 'Pagamento Recusado: ' + cardResult.message);
                return res.redirect('/pagar-pedido/' + orderId);
            }
        }

    } catch (error) {
        console.error("ERRO REPAGAMENTO:", error);
        req.flash('error', 'Erro ao processar. Tente novamente.');
        res.redirect('/pagar-pedido/' + orderId);
    }
};


exports.getPagSeguroKey = async (req, res) => {
    try {
        const key = await paymentService.getPublicKey();
        res.json({ key: key });
    } catch (e) {
        res.status(500).json({ error: 'Erro chave' });
    }
};


// ==========================================
// 14. CONTROLE DE QUANTIDADE (+/-)
// ==========================================

// AUMENTAR QUANTIDADE
exports.postCartIncrease = async (req, res) => {
    const { productId, size, color } = req.body;
    const cart = req.session.cart;
    if (!cart) return res.redirect('/carrinho');

    // Acha o item exato
    const itemIndex = cart.items.findIndex(i => i.productId === productId && i.size === size && (i.color || '') === color);

    if (itemIndex >= 0) {
        cart.items[itemIndex].qty += 1;
        cart.totalQty += 1;
        cart.totalPrice += parseFloat(cart.items[itemIndex].price);
        
        // Recalcula desconto se tiver cupom
        if (cart.coupon) {
            const factor = (100 - cart.coupon.percent) / 100;
            cart.totalWithDiscount = cart.totalPrice * factor;
        }

        await salvarCarrinhoNoBanco(req, cart); // Função auxiliar ou código direto
    }
    
    req.session.save(() => res.redirect('/carrinho'));
};

// DIMINUIR QUANTIDADE
exports.postCartDecrease = async (req, res) => {
    const { productId, size, color } = req.body;
    const cart = req.session.cart;
    if (!cart) return res.redirect('/carrinho');

    const itemIndex = cart.items.findIndex(i => i.productId === productId && i.size === size && (i.color || '') === color);

    if (itemIndex >= 0) {
        const item = cart.items[itemIndex];
        
        if (item.qty > 1) {
            item.qty -= 1;
            cart.totalQty -= 1;
            cart.totalPrice -= parseFloat(item.price);
        } else {
            // Se for 1 e diminuir, remove o item? 
            // Geralmente sim, ou bloqueia. Vamos remover:
            cart.totalQty -= 1;
            cart.totalPrice -= parseFloat(item.price);
            cart.items.splice(itemIndex, 1);
        }

        // Recalcula cupom
        if (cart.coupon) {
            const factor = (100 - cart.coupon.percent) / 100;
            cart.totalWithDiscount = cart.totalPrice * factor;
        }

        await salvarCarrinhoNoBanco(req, cart);
    }

    req.session.save(() => res.redirect('/carrinho'));
};

// Pequena função auxiliar para não repetir código de banco
async function salvarCarrinhoNoBanco(req, cart) {
    if (req.session.user) {
        await db.collection('users').doc(req.session.user.id).update({ cart: cart }).catch(() => {});
    }
}