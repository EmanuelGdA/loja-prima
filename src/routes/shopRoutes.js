const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController'); // Importamos o novo controller

// Rota da Home agora chama a função getIndex que busca no banco
router.get('/', shopController.getIndex);

// Rota dinâmica: Os dois pontos (:) dizem que productId é uma variável
router.get('/produto/:productId', shopController.getProduct);


// --- NOVAS ROTAS DO CARRINHO ---
router.get('/carrinho', shopController.getCart);
router.post('/carrinho', shopController.postCart); // Quando clica em "Comprar"
router.post('/carrinho-delete', shopController.postCartDeleteProduct); // Remover item
router.get('/login', (req, res) => res.render('user/login', { pageTitle: 'Login' }));

// ...
router.get('/checkout', shopController.getCheckout);
router.post('/criar-pedido', shopController.postOrder); // Botão "Pagar"
router.get('/pedidos', shopController.getOrders);

module.exports = router;