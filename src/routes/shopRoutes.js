const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController'); // Importamos o novo controller

// Rota da Home agora chama a função getIndex que busca no banco
router.get('/', shopController.getIndex);

// Rota dinâmica: Os dois pontos (:) dizem que productId é uma variável
router.get('/produto/:productId', shopController.getProduct);
router.post('/produto/avaliar', shopController.postReview);

// --- ROTAS DO CARRINHO ---
router.get('/carrinho', shopController.getCart);
router.post('/carrinho', shopController.postCart); // Quando clica em "Comprar"
router.post('/carrinho-delete', shopController.postCartDeleteProduct); // Remover item
router.post('/carrinho/aumentar', shopController.postCartIncrease);
router.post('/carrinho/diminuir', shopController.postCartDecrease);
router.post('/carrinho/cupom', shopController.postApplyCoupon);
router.post('/carrinho/remover-cupom', shopController.postRemoveCoupon);

// Rotas de Usuário/Checkout
router.get('/login', (req, res) => res.render('user/login', { pageTitle: 'Login' }));
router.get('/checkout', shopController.getCheckout);
router.post('/criar-pedido', shopController.postOrder); // Botão "Pagar"
router.get('/pedidos', shopController.getOrders);

// NOVAS ROTAS DE PAGAMENTO TARDIO
router.get('/pagar-pedido/:orderId', shopController.getPayOrder);
router.post('/pagar-pedido/:orderId', shopController.postPayOrder);

// ROTA DE LANÇAMENTOS
router.get('/colecao/lancamentos', shopController.getNewArrivals);

router.get('/colecao/:categoryName/:subcategoryName', shopController.getSubCategory);

// ROTA DE PROMOÇÕES 
router.get('/colecao/promocao', shopController.getPromotions);

// Rota de Categoria (Ex: /colecao/vestidos)
router.get('/colecao/:categoryName', shopController.getCategory);

// Rota de Busca
router.get('/search', shopController.getSearch);

// ROTAS DE FAVORITOS
router.get('/favoritos', shopController.getFavoritesPage); // Abre a página
router.post('/api/favoritos', shopController.postGetFavoriteProducts); // Busca os dados

// NOVAS ROTAS DE SINCRONIZAÇÃO
router.post('/api/toggle-favorite', shopController.postToggleFavoriteAPI); // Clica no coração
router.get('/api/get-user-favorites', shopController.getUserFavoritesAPI); // Carrega ao entrar

// rota api/frete 
router.post('/api/frete', shopController.postCalculateShipping);

// Rota Genérica para páginas de texto (trocas, entrega, contato)
router.get('/institucional/:page', shopController.getInstitucional);

// Rota de segurança
router.get('/api/pagseguro-key', shopController.getPagSeguroKey);

router.post('/api/webhook/mp', shopController.mercadoPagoWebhook);

module.exports = router;