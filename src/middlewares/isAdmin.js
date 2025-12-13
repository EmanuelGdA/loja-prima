module.exports = (req, res, next) => {
    // Verifica se está logado E se é admin
    if (!req.session.isLoggedIn || !req.session.user || !req.session.user.isAdmin) {
        return res.status(403).send('Acesso Negado: Você não tem permissão de administrador.');
    }
    next();
};