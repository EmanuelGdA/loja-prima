const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const isAdmin = require('../middlewares/isAdmin');
const multer = require('multer');
 
const upload = multer({ storage: multer.memoryStorage() });  
const bannerController = require('../controllers/bannerController');


// Configuração do Multer p/ os dois campos
const bannerUpload = upload.fields([
    { name: 'imageDesktop', maxCount: 1 },
    { name: 'imageMobile', maxCount: 1 }
]);

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



// GESTÃO DE CATEGORIAS
router.get('/categorias', isAdmin, adminController.getManageCategories);
router.post('/excluir-categoria', isAdmin, adminController.postDeleteCategory);
router.post('/excluir-subcategoria', isAdmin, adminController.postDeleteSubCategory);


// ROTAS DE CUPONS (NOVAS)
router.get('/cupons', isAdmin, adminController.getCoupons);
router.post('/criar-cupom', isAdmin, adminController.postAddCoupon);
router.post('/excluir-cupom', isAdmin, adminController.postDeleteCoupon);


// Rotas de Pedidos (Protegidas)
router.get('/pedidos', isAdmin, adminController.getOrders);
router.post('/atualizar-status', isAdmin, adminController.postUpdateStatus);
router.post('/excluir-pedido', isAdmin, adminController.postDeleteOrder);

router.get('/aniversariantes', isAdmin, adminController.getBirthdays);


// Rotas de Banners (Admin) - ADICIONADO isAdmin para segurança
router.get('/banners', isAdmin, bannerController.getManageBanners);
router.post('/banners/adicionar', isAdmin, bannerUpload, bannerController.postAddBanner);
router.post('/banners/excluir', isAdmin, bannerController.postDeleteBanner);

router.get('/clientes', isAdmin, adminController.getUsers);

module.exports = router;