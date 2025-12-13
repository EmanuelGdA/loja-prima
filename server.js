require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const csrf = require('csurf');
const helmet = require('helmet');
const flash = require('connect-flash');

// Inicializa o App
const app = express();

// 1. Importar Rotas
const shopRoutes = require('./src/routes/shopRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const authRoutes = require('./src/routes/authRoutes');

// 2. Configurar View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', 'views'); // Pasta onde estão os HTMLs

// 3. Middlewares de Segurança e Parsers
app.use(helmet()); // Protege cabeçalhos HTTP
app.use(bodyParser.urlencoded({ extended: false })); // Para ler formulários
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // Pasta pública (CSS/IMG)

// 4. Configurar Sessão (Login e Carrinho temporário)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', // True se estiver em HTTPS
        maxAge: 1000 * 60 * 60 * 24 // 1 dia
    }
}));

// 5. Proteção CSRF (Deve vir depois da sessão e cookie parser)
const csrfProtection = csrf();
app.use(csrfProtection);

// 6. Mensagens Flash (Erros/Sucesso)
app.use(flash());

// 7. Variáveis Globais para as Views
app.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isLoggedIn;
    res.locals.csrfToken = req.csrfToken();
    res.locals.errorMessage = req.flash('error');
    res.locals.successMessage = req.flash('success');
    
    // NOVO: Calcula total de itens no carrinho
    let cartCount = 0;
    if (req.session.cart) {
        cartCount = req.session.cart.totalQty;
    }
    res.locals.cartCount = cartCount; // Disponível em todos os EJS

    next();
});

// 8. Usar as Rotas
app.use('/admin', adminRoutes); // Tudo que começa com /admin
app.use(shopRoutes);            // Home, produtos, carrinho
app.use(authRoutes);            // Login, registro

// 9. Página 404 (Erro)
app.use((req, res, next) => {
    res.status(404).render('404', { pageTitle: 'Página Não Encontrada', path: '' });
});

// 10. Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
});