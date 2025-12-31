const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid'); // Para gerar o token
const emailService = require('../services/emailService'); // Importa o envio de email
const admin = require('firebase-admin');

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

// 1. CADASTRAR (Gera Código e Mostra Tela de Validação)
exports.postSignup = async (req, res) => {
    const { name, email, confirmEmail, phone, password, confirmPassword } = req.body;

    if (email !== confirmEmail) { req.flash('error', 'E-mails não conferem.'); return res.redirect('/cadastro'); }
    if (password !== confirmPassword) { req.flash('error', 'Senhas não conferem.'); return res.redirect('/cadastro'); }

    try {
        // 1. Verifica se já existe no Banco
        const userRef = db.collection('users');
        const snapshot = await userRef.where('email', '==', email).get();

        if (!snapshot.empty) {
            req.flash('error', 'E-mail já cadastrado.');
            return res.redirect('/cadastro');
        }

        // 2. CRIA NO FIREBASE AUTH (Para o Google gerenciar a senha/email)
        // Isso é o que permite o envio de email funcionar
        await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
            disabled: false
        });

        // 3. Salva no Banco de Dados (Para a gente gerenciar o resto)
        const hashedPassword = await bcrypt.hash(password, 12); // Mantemos o hash local por segurança do nosso sistema legado
        
        await userRef.add({
            name: name,
            email: email,
            phone: phone,
            password: hashedPassword, // Mantemos senha local também
            isAdmin: false,
            createdAt: new Date().toISOString()
        });

        // 4. Manda o e-mail usando o serviço novo
        await emailService.sendVerificationEmail(email);

        req.flash('success', 'Conta criada! Verifique seu e-mail (Link oficial do Google).');
        res.redirect('/login');

    } catch (err) {
        console.log("Erro Cadastro:", err);
        // Se der erro que o email já existe no Auth
        if (err.code === 'auth/email-already-exists') {
            req.flash('error', 'Este e-mail já está cadastrado no sistema.');
        } else {
            req.flash('error', 'Erro ao criar conta.');
        }
        res.redirect('/cadastro');
    }
};

// 2. VERIFICAR CÓDIGO E JÁ LOGAR (NOVO!)
exports.postVerifyCode = async (req, res) => {
    const { email, code } = req.body;

    try {
        const snapshot = await db.collection('users')
            .where('email', '==', email)
            .where('verifyCode', '==', code) // Busca usuário com esse email E esse código
            .get();

        if (snapshot.empty) {
            // Se errou, volta para a mesma tela
            return res.render('user/verify-code', {
                pageTitle: 'Validar Conta',
                email: email,
                errorMessage: 'Código incorreto. Tente novamente.'
            });
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        // 1. Atualiza no Banco (Conta Verificada!)
        await db.collection('users').doc(userDoc.id).update({
            isVerified: true,
            verifyCode: null // Limpa o código
        });

        // 2. LOGIN AUTOMÁTICO (Aqui está a mágica)
        req.session.isLoggedIn = true;
        req.session.user = { 
            id: userDoc.id, 
            name: userData.name, 
            email: userData.email,
            isAdmin: userData.isAdmin || false 
        };

        req.session.save(() => {
            req.flash('success', 'Conta verificada! Bem-vindo(a).');
            res.redirect('/'); // Manda direto pra Home logado
        });

    } catch (error) {
        console.log(error);
        res.redirect('/login');
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

        // --- TRAVA DE SEGURANÇA 
        // Se a conta não foi verificada, impede o login
        if (!user.isVerified) {
            req.flash('error', 'Sua conta ainda não foi confirmada. Verifique seu e-mail (incluindo Spam).');
            return res.redirect('/login');
        }
        // -------------------------------

        const doMatch = await bcrypt.compare(password, user.password);

        if (doMatch) {
            req.session.isLoggedIn = true;
            
            // Verifica se o usuário tem carrinho salvo no banco
            if (userDoc.data().cart) {
                // Restaura o carrinho antigo
                req.session.cart = userDoc.data().cart;
            } else if (req.session.cart && req.session.cart.items.length > 0) {
                // Se ele não tinha carrinho salvo, mas montou um agora antes de logar,
                // salvamos esse carrinho novo no banco para não perder.
                await db.collection('users').doc(userDoc.id).update({
                    cart: req.session.cart
                });
            }

            req.session.user = { 
                id: userDoc.id, 
                name: user.name, 
                email: user.email,
                phone: user.phone || '', 
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

// 3. RECUPERAR SENHA (USANDO GOOGLE)
exports.postForgotPassword = async (req, res) => {
    const email = req.body.email;
    try {
        // Verifica se existe no nosso banco
        const snapshot = await db.collection('users').where('email', '==', email).get();
        if (snapshot.empty) {
            req.flash('error', 'E-mail não encontrado.');
            return res.redirect('/esqueci-senha');
        }

        // Pede pro Google mandar o e-mail
        await emailService.sendResetEmail(email);

        req.flash('success', 'Se o e-mail estiver cadastrado, você receberá um link do Google em instantes.');
        res.redirect('/login');
    } catch (error) {
        console.log(error);
        req.flash('error', 'Erro ao processar.');
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

// 6. LOGIN COM GOOGLE
exports.googleLogin = async (req, res) => {
    const idToken = req.body.token;

    try {
        // 1. Verifica se o token do Google é verdadeiro
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email, name, picture } = decodedToken;

        // 2. Verifica se o usuário já existe no nosso banco 'users'
        const userRef = db.collection('users');
        const snapshot = await userRef.where('email', '==', email).get();

        let userDocId;
        let userData;

        if (snapshot.empty) {
            // USUÁRIO NOVO: Cria a conta automaticamente
            const newUser = {
                name: name || 'Usuário Google',
                email: email,
                phone: '', // Google não manda telefone fácil
                isAdmin: false,
                isVerified: true, // Google já verificou!
                googleId: uid,
                createdAt: new Date().toISOString()
            };
            const docRef = await userRef.add(newUser);
            userDocId = docRef.id;
            userData = newUser;
        } else {
            // USUÁRIO EXISTENTE: Só pega os dados
            const doc = snapshot.docs[0];
            userDocId = doc.id;
            userData = doc.data();
        }

        // 3. Cria a Sessão (Loga o usuário)
        req.session.isLoggedIn = true;
        req.session.user = { 
            id: userDocId, 
            name: userData.name, 
            email: userData.email,
            isAdmin: userData.isAdmin || false 
        };

        // Recupera carrinho (se tiver)
        if (userData.cart) { req.session.cart = userData.cart; }

        req.session.save(() => {
            res.json({ status: 'success' });
        });

    } catch (error) {
        console.error("Erro Google Login:", error);
        res.status(401).json({ status: 'error', message: 'Token inválido' });
    }
};