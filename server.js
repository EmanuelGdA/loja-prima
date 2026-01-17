require('dotenv').config();
const { db } = require('./src/config/firebase');

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const csrf = require('csurf');
const helmet = require('helmet');
const flash = require('connect-flash');
const shopController = require('./src/controllers/shopController');

// Inicializa o App
const app = express();

// Isso diz ao Express para confiar que o Render está usando HTTPS
app.set('trust proxy', 1); 


// 1. Importar Rotas
const shopRoutes = require('./src/routes/shopRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const authRoutes = require('./src/routes/authRoutes');

// 2. Configurar View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', 'views'); // Pasta onde estão os HTMLs

// 3. Middlewares de Segurança
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);
app.use(bodyParser.urlencoded({ extended: false })); // Para ler formulários
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // Pasta pública (CSS/IMG)

// 4. Configurar Sessão (AGORA SALVANDO NO FIREBASE)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 1000 * 60 * 60 * 24 * 7, // Mantém logado por 7 dias
        sameSite: 'lax'
    }
}));

// 5. Proteção CSRF (Deve vir depois da sessão e cookie parser)
app.post('/api/webhook/mp', shopController.mercadoPagoWebhook);

const csrfProtection = csrf();
app.use(csrfProtection);

// 6. Mensagens Flash (Erros/Sucesso)
app.use(flash());

// 7. Variáveis Globais para as Views
app.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isLoggedIn;
    
    // NOVO: Verifica se é admin e manda para o HTML
    res.locals.isAdmin = req.session.user ? req.session.user.isAdmin : false;
    
    res.locals.csrfToken = req.csrfToken();
    res.locals.errorMessage = req.flash('error');
    res.locals.successMessage = req.flash('success');
    
    // Carrinho (mantenha o código do carrinho aqui...)
    let cartCount = 0;
    if (req.session.cart) {
        cartCount = req.session.cart.totalQty;
    }
    res.locals.cartCount = cartCount;

    next();
});

// Importa o Middleware
const menuMiddleware = require('./src/middlewares/menuMiddleware');

// Usa o Middleware (TEM QUE SER ANTES DAS ROTAS)
app.use(menuMiddleware);


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