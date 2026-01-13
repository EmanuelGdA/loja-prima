const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 1. TELA DE LOGIN (Exibe a página com abas)
router.get('/login', authController.getLogin);

// 2. PROCESSAMENTO DE LOGIN MANUAL (E-mail ou Telefone)
router.post('/login', authController.postLogin);

// 3. PROCESSAMENTO DE CADASTRO MANUAL
router.post('/signup', authController.postSignup);

// 4. LOGIN COM GOOGLE
router.post('/auth/google', authController.googleLogin);

// 5. LOGOUT (Sair)
// Mudei para GET para facilitar o uso em links de "Sair" no menu
router.get('/logout', authController.postLogout); 

// Redireciona rotas antigas para o login
router.get('/cadastro', (req, res) => res.redirect('/login'));
router.get('/esqueci-senha', (req, res) => res.redirect('/login'));

module.exports = router;