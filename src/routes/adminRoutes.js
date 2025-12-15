const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const isAdmin = require('../middlewares/isAdmin'); // Importa o segurança

// Rotas de Produtos (Protegidas)
router.get('/adicionar-produto', isAdmin, adminController.getAddProduct);
router.post('/adicionar-produto', isAdmin, adminController.postAddProduct);
router.get('/produtos', isAdmin, adminController.getProducts); // Lista de produtos
router.post('/excluir-produto', isAdmin, adminController.postDeleteProduct); // Excluir
router.get('/editar-produto/:productId', isAdmin, adminController.getEditProduct); // Tela de Edição
router.post('/editar-produto', isAdmin, adminController.postEditProduct); // Salvar Edição

// Rotas de Pedidos (Protegidas)
router.get('/pedidos', isAdmin, adminController.getOrders);
router.post('/atualizar-status', isAdmin, adminController.postUpdateStatus);

module.exports = router;