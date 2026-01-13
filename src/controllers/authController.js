const { db } = require('../config/firebase');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs'); // Para as senhas

// 1. TELA DE LOGIN/CADASTRO
exports.getLogin = (req, res) => {
    if (req.session.isLoggedIn) return res.redirect('/');
    
    res.render('user/login', { 
        pageTitle: 'Entrar ou Criar Conta', 
        path: '/login',
        errorMessage: req.flash('error')[0] || null
    });
};

// 2. CADASTRO MANUAL (Email, Telefone e Senha)
exports.postSignup = async (req, res) => {
    const { name, email, phone, password } = req.body;
    
    // Limpeza do telefone (deixa só números)
    const cleanPhone = phone.replace(/\D/g, '');

    try {
        const userRef = db.collection('users');

        // Verifica se o Email ou Telefone já existem
        const emailCheck = await userRef.where('email', '==', email).get();
        const phoneCheck = await userRef.where('phone', '==', cleanPhone).get();

        if (!emailCheck.empty) {
            req.flash('error', 'Este e-mail já está cadastrado.');
            return res.redirect('/login');
        }
        if (!phoneCheck.empty && cleanPhone !== '') {
            req.flash('error', 'Este telefone já está cadastrado.');
            return res.redirect('/login');
        }

        // Criptografa a senha
        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = {
            name,
            email: email.toLowerCase(),
            phone: cleanPhone,
            password: hashedPassword,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            cart: { items: [], totalQty: 0, totalPrice: 0 }
        };

        await userRef.add(newUser);
        req.flash('success', 'Conta criada com sucesso! Agora você pode entrar.');
        res.redirect('/login');

    } catch (error) {
        console.error("Erro no Cadastro:", error);
        res.redirect('/login');
    }
};

// 3. LOGIN MANUAL (Aceita Email OU Telefone)
exports.postLogin = async (req, res) => {
    const { loginIdentifier, password } = req.body;
    const input = loginIdentifier.toLowerCase().trim();

    try {
        const userRef = db.collection('users');
        let userDoc = null;

        // 1. Tenta buscar por E-mail
        const emailSnapshot = await userRef.where('email', '==', input).get();
        
        if (!emailSnapshot.empty) {
            userDoc = emailSnapshot.docs[0];
        } else {
            // 2. Se não achou, limpa o input e tenta por Telefone
            const cleanPhone = input.replace(/\D/g, '');
            const phoneSnapshot = await userRef.where('phone', '==', cleanPhone).get();
            if (!phoneSnapshot.empty) {
                userDoc = phoneSnapshot.docs[0];
            }
        }

        if (!userDoc) {
            req.flash('error', 'E-mail ou Telefone não cadastrados.');
            return res.redirect('/login');
        }

        const userData = userDoc.data();
        
        // 3. Verifica se o usuário tem senha (pode ter criado via Google antes)
        if (!userData.password) {
            req.flash('error', 'Esta conta usa login do Google. Clique no botão abaixo.');
            return res.redirect('/login');
        }

        const doMatch = await bcrypt.compare(password, userData.password);
        if (doMatch) {
            // ... (Lógica de criar sessão igual ao GoogleLogin)
            req.session.isLoggedIn = true;
            req.session.user = { id: userDoc.id, name: userData.name, email: userData.email, isAdmin: userData.isAdmin };
            return req.session.save(() => res.redirect('/'));
        }

        req.flash('error', 'Senha incorreta.');
        res.redirect('/login');
    } catch (err) { console.log(err); res.redirect('/login'); }
};

// 4. LOGIN COM GOOGLE (Mantido e melhorado)
exports.googleLogin = async (req, res) => {
    const idToken = req.body.token;

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email, name } = decodedToken;

        const userRef = db.collection('users');
        const snapshot = await userRef.where('email', '==', email).get();

        let userDocId;
        let userData;

        if (snapshot.empty) {
            const newUser = {
                name: name || 'Usuário Google',
                email: email,
                phone: '',
                isAdmin: false,
                googleId: uid,
                cart: { items: [], totalQty: 0, totalPrice: 0 },
                createdAt: new Date().toISOString()
            };
            const docRef = await userRef.add(newUser);
            userDocId = docRef.id;
            userData = newUser;
        } else {
            const doc = snapshot.docs[0];
            userDocId = doc.id;
            userData = doc.data();
        }

        req.session.isLoggedIn = true;
        req.session.user = { id: userDocId, name: userData.name, email: userData.email, isAdmin: userData.isAdmin };
        
        req.session.save(() => res.json({ status: 'success' }));

    } catch (error) {
        res.status(401).json({ status: 'error' });
    }
};

exports.postLogout = (req, res) => {
    req.session.destroy(() => res.redirect('/'));
};