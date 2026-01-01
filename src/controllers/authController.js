const { db } = require('../config/firebase');
const admin = require('firebase-admin');

// 1. TELA DE LOGIN (Única tela necessária agora)
exports.getLogin = (req, res) => {
    // Se já estiver logado, manda pra home
    if (req.session.isLoggedIn) {
        return res.redirect('/');
    }
    
    res.render('user/login', { 
        pageTitle: 'Entrar', 
        path: '/login' 
    });
};

// 2. LOGIN/CADASTRO COM GOOGLE (O "Coração" do sistema agora)
exports.googleLogin = async (req, res) => {
    const idToken = req.body.token;

    try {
        // A) Valida o token com o Google
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email, name } = decodedToken;

        // B) Verifica se o usuário já existe no nosso banco
        const userRef = db.collection('users');
        const snapshot = await userRef.where('email', '==', email).get();

        let userDocId;
        let userData;

        if (snapshot.empty) {
            // ---> CLIENTE NOVO: Cria a conta automaticamente <---
            console.log("Criando novo usuário via Google:", email);
            
            const newUser = {
                name: name || 'Usuário Google',
                email: email,
                phone: '', // Google não passa telefone, pegamos no checkout depois
                isAdmin: false, // Por padrão ninguém é admin
                isVerified: true, // Google é confiável
                googleId: uid,
                cart: null, // Carrinho vazio inicialmente
                createdAt: new Date().toISOString()
            };
            
            const docRef = await userRef.add(newUser);
            userDocId = docRef.id;
            userData = newUser;
        } else {
            // ---> CLIENTE EXISTENTE: Só pega os dados <---
            console.log("Usuário Google retornou:", email);
            const doc = snapshot.docs[0];
            userDocId = doc.id;
            userData = doc.data();
        }

        // C) Recuperar Carrinho (Sincronização)
        // Se o usuário tinha um carrinho salvo no banco, carregamos na sessão
        if (userData.cart && userData.cart.items.length > 0) {
            req.session.cart = userData.cart;
        } 
        // Se ele não tinha no banco, mas montou um agora deslogado, salvamos no banco
        else if (req.session.cart && req.session.cart.items.length > 0) {
            await db.collection('users').doc(userDocId).update({
                cart: req.session.cart
            });
        }

        // D) Cria a Sessão Final
        req.session.isLoggedIn = true;
        req.session.user = { 
            id: userDocId, 
            name: userData.name, 
            email: userData.email,
            isAdmin: userData.isAdmin || false // Garante que Admin funcione
        };

        req.session.save(() => {
            res.json({ status: 'success' });
        });

    } catch (error) {
        console.error("Erro Google Login:", error);
        res.status(401).json({ status: 'error', message: 'Falha na autenticação com Google.' });
    }
};

// 3. LOGOUT
exports.postLogout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
};

