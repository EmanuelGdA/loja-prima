const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const isAdmin = require('../middlewares/isAdmin'); // Importa o segurança

// Adicionamos 'isAdmin' no meio da rota. O Node executa na ordem.
// Se 'isAdmin' der erro, ele nem chama o controller.

router.get('/adicionar-produto', isAdmin, adminController.getAddProduct);
router.post('/adicionar-produto', isAdmin, adminController.postAddProduct);

router.get('/pedidos', isAdmin, adminController.getOrders);
router.post('/atualizar-status', isAdmin, adminController.postUpdateStatus);



    if(!req.session.user) return res.redirect('/login');
    
    const db = require('../config/firebase');
    await db.collection('users').doc(req.session.user.id).update({ isAdmin: true });
    
    // Atualiza a sessão
    req.session.user.isAdmin = true;
    res.send("<h1>Sucesso! Você agora é um Administrador. <a href='/'>Voltar</a></h1>");


module.exports = router;