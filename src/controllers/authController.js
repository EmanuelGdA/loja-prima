const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');

// --- EXIBIR FORMULÁRIOS (GET) ---

exports.getLogin = (req, res) => {
    res.render('user/login', {
        pageTitle: 'Entrar - Loja da Prima',
        path: '/login'
    });
};

exports.getSignup = (req, res) => {
    res.render('user/register', {
        pageTitle: 'Criar Conta',
        path: '/cadastro'
    });
};

// --- PROCESSAR DADOS (POST) ---

// 1. CADASTRAR NOVO USUÁRIO
exports.postSignup = async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    // Validação básica (ideal é usar Joi aqui depois)
    if (password !== confirmPassword) {
        req.flash('error', 'As senhas não conferem.');
        return res.redirect('/cadastro');
    }

    try {
        // Verifica se e-mail já existe
        const userRef = db.collection('users');
        const snapshot = await userRef.where('email', '==', email).get();

        if (!snapshot.empty) {
            req.flash('error', 'E-mail já cadastrado.');
            return res.redirect('/cadastro');
        }

        // Criptografa a senha (Hash) - O '12' é a força da criptografia
        const hashedPassword = await bcrypt.hash(password, 12);

        // Salva no Firebase
        await userRef.add({
            name: name,
            email: email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        });

        req.flash('success', 'Conta criada! Faça login.');
        res.redirect('/login');

    } catch (err) {
        console.log(err);
        res.redirect('/cadastro');
    }
};

// 2. FAZER LOGIN
exports.postLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const userRef = db.collection('users');
        const snapshot = await userRef.where('email', '==', email).get();

        if (snapshot.empty) {
            req.flash('error', 'E-mail ou senha inválidos.');
            return res.redirect('/login');
        }

        // Pega o primeiro usuário encontrado
        const userDoc = snapshot.docs[0];
        const user = userDoc.data();

        // Compara a senha digitada com a criptografada no banco
        const doMatch = await bcrypt.compare(password, user.password);

        if (doMatch) {
            
            req.session.isLoggedIn = true;
            
            // ATUALIZADO: Salvamos também se ele é admin (padrão false se não existir)
            req.session.user = { 
                id: userDoc.id, 
                name: user.name, 
                email: user.email,
                isAdmin: user.isAdmin || false 
            };
            
            return req.session.save(err => {
                res.redirect('/');
            });
        }

        req.flash('error', 'E-mail ou senha inválidos.');
        res.redirect('/login');

    } catch (err) {
        console.log(err);
        res.redirect('/login');
    }
};

// 3. SAIR (LOGOUT)
exports.postLogout = (req, res) => {
    req.session.destroy(err => {
        console.log("Usuário deslogado");
        res.redirect('/');
    });
};