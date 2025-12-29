const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid'); // Para gerar o token
const emailService = require('../services/emailService'); // Importa o envio de email

// --- EXIBIR FORMULÁRIOS ---
exports.getLogin = (req, res) => {
    res.render('user/login', { pageTitle: 'Entrar', path: '/login' });
};

exports.getSignup = (req, res) => {
    res.render('user/register', { pageTitle: 'Criar Conta', path: '/cadastro' });
};

exports.getForgotPassword = (req, res) => {
    res.render('user/forgot-password', { pageTitle: 'Recuperar Senha', path: '/reset' });
};

exports.getResetPassword = (req, res) => {
    const token = req.params.token;
    res.render('user/reset-password', { pageTitle: 'Nova Senha', path: '/reset', token: token });
};

// --- PROCESSAR DADOS ---

// 1. CADASTRAR (COM VALIDAÇÃO DE TELEFONE)
exports.postSignup = async (req, res) => {
    const { name, email, phone, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        req.flash('error', 'As senhas não conferem.');
        return res.redirect('/cadastro');
    }

    // Validação Simples de Telefone (10 ou 11 dígitos)
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
        req.flash('error', 'Por favor, insira um telefone válido com DDD.');
        return res.redirect('/cadastro');
    }

    try {
        const userRef = db.collection('users');
        const snapshot = await userRef.where('email', '==', email).get();

        if (!snapshot.empty) {
            req.flash('error', 'E-mail já cadastrado.');
            return res.redirect('/cadastro');
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await userRef.add({
            name: name,
            email: email,
            phone: phone, 
            password: hashedPassword,
            isAdmin: false,
            createdAt: new Date().toISOString()
        });

        req.flash('success', 'Conta criada! Faça login.');
        res.redirect('/login');

    } catch (err) {
        console.log(err);
        req.flash('error', 'Erro ao criar conta.');
        res.redirect('/cadastro');
    }
};

// 2. LOGIN
exports.postLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const userRef = db.collection('users');
        const snapshot = await userRef.where('email', '==', email).get();

        if (snapshot.empty) {
            req.flash('error', 'E-mail ou senha inválidos.');
            return res.redirect('/login');
        }

        const userDoc = snapshot.docs[0];
        const user = userDoc.data();
        const doMatch = await bcrypt.compare(password, user.password);

        if (doMatch) {
            req.session.isLoggedIn = true;
            req.session.user = { 
                id: userDoc.id, 
                name: user.name, 
                email: user.email,
                cpf: user.cpf || '', // Prepara para ter CPF
                isAdmin: user.isAdmin || false 
            };
            return req.session.save(err => res.redirect('/'));
        }

        req.flash('error', 'E-mail ou senha inválidos.');
        res.redirect('/login');

    } catch (err) {
        console.log(err);
        res.redirect('/login');
    }
};

// 3. SOLICITAR RESET DE SENHA (ENVIA EMAIL)
exports.postForgotPassword = async (req, res) => {
    const email = req.body.email;

    try {
        const snapshot = await db.collection('users').where('email', '==', email).get();

        if (snapshot.empty) {
            req.flash('error', 'E-mail não encontrado.');
            return res.redirect('/esqueci-senha');
        }

        const userDoc = snapshot.docs[0];
        const token = uuidv4(); // Gera código único
        const expireDate = new Date();
        expireDate.setHours(expireDate.getHours() + 1); // Vence em 1 hora

        // Salva o token no usuário
        await db.collection('users').doc(userDoc.id).update({
            resetToken: token,
            resetTokenExpire: expireDate.toISOString()
        });

        // Envia o e-mail
        await emailService.sendResetEmail(email, token);

        req.flash('success', 'Verifique seu e-mail para redefinir a senha.');
        res.redirect('/login');

    } catch (error) {
        console.log(error);
        req.flash('error', 'Erro ao processar solicitação.');
        res.redirect('/esqueci-senha');
    }
};

// 4. SALVAR NOVA SENHA
exports.postResetPassword = async (req, res) => {
    const { token, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        req.flash('error', 'As senhas não conferem.');
        return res.redirect(`/redefinir-senha/${token}`);
    }

    try {
        // Busca usuário com esse token
        const snapshot = await db.collection('users')
            .where('resetToken', '==', token)
            .get();

        if (snapshot.empty) {
            req.flash('error', 'Link inválido ou expirado.');
            return res.redirect('/login');
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        // Verifica validade da data
        if (new Date() > new Date(userData.resetTokenExpire)) {
            req.flash('error', 'O link expirou. Solicite novamente.');
            return res.redirect('/esqueci-senha');
        }

        // Criptografa nova senha e limpa o token
        const hashedPassword = await bcrypt.hash(password, 12);
        
        await db.collection('users').doc(userDoc.id).update({
            password: hashedPassword,
            resetToken: null,
            resetTokenExpire: null
        });

        req.flash('success', 'Senha alterada com sucesso!');
        res.redirect('/login');

    } catch (error) {
        console.log(error);
        res.redirect('/login');
    }
};

// 5. LOGOUT
exports.postLogout = (req, res) => {
    req.session.destroy(() => res.redirect('/'));
};