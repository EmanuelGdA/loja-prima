const { db } = require('../config/firebase');

module.exports = async (req, res, next) => {
    try {
        // Busca todas as categorias salvas
        const snapshot = await db.collection('categories').get();
        const menuCategories = snapshot.docs.map(doc => doc.data());

        // Disponibiliza para TODOS os arquivos EJS
        res.locals.menuCategories = menuCategories;
        next();
    } catch (error) {
        console.error("Erro ao carregar menu:", error);
        res.locals.menuCategories = []; // Menu vazio se der erro
        next();
    }
};