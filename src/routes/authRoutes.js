const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Rotas Limpas
router.get('/login', authController.getLogin);
router.post('/auth/google', authController.googleLogin);
router.post('/logout', authController.postLogout);

// Redireciona rotas antigas para o login (para ninguém ficar perdido)
router.get('/cadastro', (req, res) => res.redirect('/login'));
router.get('/esqueci-senha', (req, res) => res.redirect('/login'));

module.exports = router;