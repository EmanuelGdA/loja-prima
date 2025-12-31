const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/auth/google', authController.googleLogin);
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);
router.post('/logout', authController.postLogout);

router.get('/cadastro', authController.getSignup);
router.post('/cadastro', authController.postSignup);

router.post('/verificar-codigo', authController.postVerifyCode);

// NOVAS ROTAS (Recuperar Senha)
router.get('/esqueci-senha', authController.getForgotPassword);
router.post('/esqueci-senha', authController.postForgotPassword);

router.get('/redefinir-senha/:token', authController.getResetPassword);
router.post('/redefinir-senha', authController.postResetPassword);


module.exports = router;