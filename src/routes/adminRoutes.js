const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// GET /admin/adicionar-produto => Renderiza o formulário
router.get('/adicionar-produto', adminController.getAddProduct);

// POST /admin/adicionar-produto => Recebe os dados e salva
router.post('/adicionar-produto', adminController.postAddProduct);

module.exports = router;