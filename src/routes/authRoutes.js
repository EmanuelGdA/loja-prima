const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.getLogin);
router.get('/cadastro', authController.getSignup);

router.post('/login', authController.postLogin);
router.post('/cadastro', authController.postSignup);
router.post('/logout', authController.postLogout);

module.exports = router;