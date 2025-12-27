const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const isAdmin = require('../middlewares/isAdmin');
const multer = require('multer');
const { storage } = require('../config/cloudinary'); 
const upload = multer({ storage: storage }); 

// Rotas de Produtos (Protegidas)

// GET: Só mostra a tela (não precisa de upload)
router.get('/adicionar-produto', isAdmin, adminController.getAddProduct);

// POST: Recebe o formulário com foto -> AQUI PRECISA DO UPLOAD
router.post('/adicionar-produto', isAdmin, upload.array('images', 5), adminController.postAddProduct);

router.get('/produtos', isAdmin, adminController.getProducts);
router.post('/excluir-produto', isAdmin, adminController.postDeleteProduct);

router.get('/editar-produto/:productId', isAdmin, adminController.getEditProduct);

// POST: Edição também recebe foto 
router.post('/editar-produto', isAdmin, upload.array('images', 5), adminController.postEditProduct);


// ROTA DA FAXINA 
router.post('/sincronizar-menu', isAdmin, adminController.postRefreshMenu);

// ROTAS DE CUPONS (NOVAS)
router.get('/cupons', isAdmin, adminController.getCoupons);
router.post('/criar-cupom', isAdmin, adminController.postAddCoupon);
router.post('/excluir-cupom', isAdmin, adminController.postDeleteCoupon);


// Rotas de Pedidos (Protegidas)
router.get('/pedidos', isAdmin, adminController.getOrders);
router.post('/atualizar-status', isAdmin, adminController.postUpdateStatus);

module.exports = router;