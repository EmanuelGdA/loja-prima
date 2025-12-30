const { db } = require('../config/firebase');

// ==========================================
// 1. FUNÇÕES DE ADICIONAR (JÁ EXISTIAM)
// ==========================================

exports.getAddProduct = (req, res) => {
    res.render('admin/edit-product', {
        pageTitle: 'Adicionar Produto',
        path: '/admin/adicionar-produto',
        editing: false, // Define que NÃO estamos editando
        product: {} // Envia um produto vazio para o formulário não quebrar
    });
};

// --- FUNÇÃO AUXILIAR: Converte "R$ 1.200,50" para número 1200.50
const parseCurrency = (str) => {
    if (!str) return 0;
    // Remove "R$", pontos e espaços, troca vírgula por ponto
    const cleanStr = str.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
    return parseFloat(cleanStr);
};

exports.postAddProduct = async (req, res) => {
    try {
        const body = req.body;
        
        // 1. Multifotos (Cloudinary) - MANTIDO
        let images = [];
        if (req.files && req.files.length > 0) {
            images = req.files.map(f => f.path);
        } else {
            return res.status(422).send("Pelo menos uma foto é obrigatória.");
        }

        // --- LÓGICA NOVA: GUIA DE MEDIDAS DINÂMICO ---
        let measureList = [];
        
        // Verifica se o usuário adicionou alguma linha de medida
        if (body.measure_names) {
            // Garante que sejam Arrays (se vier só 1 linha, o HTML manda string, aí convertemos)
            const names = Array.isArray(body.measure_names) ? body.measure_names : [body.measure_names];
            const pp = Array.isArray(body.measure_PP) ? body.measure_PP : [body.measure_PP];
            const p = Array.isArray(body.measure_P) ? body.measure_P : [body.measure_P];
            const m = Array.isArray(body.measure_M) ? body.measure_M : [body.measure_M];
            const g = Array.isArray(body.measure_G) ? body.measure_G : [body.measure_G];
            const gg = Array.isArray(body.measure_GG) ? body.measure_GG : [body.measure_GG];
            
            // Loop para montar o objeto de cada linha
            for (let i = 0; i < names.length; i++) {
                if (names[i].trim() !== '') { // Só salva se tiver nome
                    measureList.push({
                        name: names[i],
                        PP: pp[i] || '-',
                        P: p[i] || '-',
                        M: m[i] || '-',
                        G: g[i] || '-',
                        GG: gg[i] || '-'
                    });
                }
            }
        }
        // ----------------------------------------------

        // 2. Categoria Dinâmica - MANTIDO
        const finalCategory = (body.categorySelect === 'new' && body.newCategory) ? body.newCategory : body.categorySelect;

        // 3. Cores e Tamanhos - MANTIDO
        let sizes = body.sizes || [];
        if (!Array.isArray(sizes)) sizes = [sizes];

        let colors = body.colors || [];
        if (!Array.isArray(colors)) colors = [colors];

        const newProduct = {
            // Dados Básicos
            title: body.title,
            sku: body.sku || '',
            description: body.description,
            
            category: finalCategory,
            subcategory: body.subcategory || '',
            
            // Imagens
            images: images, 
            imageUrl: images[0], 

            // Preços (Função parseCurrency deve estar no topo do arquivo)
            price: parseCurrency(body.originalPrice), 
            promoPrice: body.promoPrice ? parseCurrency(body.promoPrice) : null,
            finalPrice: body.promoPrice ? parseCurrency(body.promoPrice) : parseCurrency(body.originalPrice),

            // Detalhes
            stock: parseInt(body.stock) || 0,
            material: body.material || '',
            
            // Arrays
            sizes: sizes,
            colors: colors, 

            // Visibilidade
            isActive: body.isActive === 'true',

            // Frete
            weight: parseFloat(body.weight) || 0.3,
            height: parseInt(body.height) || 5,
            width: parseInt(body.width) || 20,
            length: parseInt(body.length) || 20,

            // NOVA PROPRIEDADE: Salva a lista dinâmica que criamos acima
            measures: measureList, 

            createdAt: new Date().toISOString()
        };
        
        // Atualiza menu lateral
        await updateCategoryList(finalCategory, body.subcategory);
        
        await db.collection('products').add(newProduct);
        console.log('Produto Criado com Sucesso!');
        res.redirect('/admin/produtos');

    } catch (error) {
        console.log("Erro Add:", error);
        res.status(500).send("Erro no servidor");
    }
};

// ==========================================
// 2. FUNÇÕES DE PEDIDOS (JÁ EXISTIAM)
// ==========================================

exports.getOrders = async (req, res) => {
    try {
        const snapshot = await db.collection('orders').orderBy('date', 'desc').get();
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Cálculos do Dashboard
        const stats = {
            totalSales: 0,
            pending: 0,
            paid: 0,
            shipped: 0
        };

        orders.forEach(o => {
            // Soma vendas apenas de pedidos pagos/enviados/entregues
            if (!o.status.includes('Cancelado') && !o.status.includes('Aguardando')) {
                stats.totalSales += parseFloat(o.totalPrice || 0);
            }
            
            if (o.status.includes('Aguardando')) stats.pending++;
            if (o.status.includes('Pago') || o.status.includes('Preparando')) stats.paid++;
            if (o.status.includes('Enviado')) stats.shipped++;
        });

        res.render('admin/orders', {
            pageTitle: 'Gestão de Vendas',
            path: '/admin/pedidos',
            orders: orders,
            stats: stats // Envia os números para a tela
        });
    } catch (error) {
        console.log("Erro ao buscar pedidos:", error);
        res.redirect('/admin/dashboard');
    }
};

exports.postUpdateStatus = async (req, res) => {
    const { orderId, status, trackingCode } = req.body;
    try {
        await db.collection('orders').doc(orderId).update({ status: status, trackingCode: trackingCode || '' // Salva o código ou vazio se não tiver 
        });
        console.log(`Pedido ${orderId} atualizado para ${status}`);
        res.redirect('/admin/pedidos');
    } catch (error) {
        console.log(error);
        res.redirect('/admin/pedidos');
    }
};

// ==========================================
// 3. NOVAS FUNÇÕES (QUE ESTAVAM FALTANDO)
// ==========================================

// 5. LISTAR PRODUTOS (Para o Admin gerenciar)
exports.getProducts = async (req, res) => {
    try {
        const snapshot = await db.collection('products').get();
        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('admin/products', {
            pageTitle: 'Gerenciar Produtos',
            path: '/admin/produtos',
            products: products
        });
    } catch (error) {
        console.log(error);
        res.redirect('/');
    }
};

// 6. EXCLUIR PRODUTO (ATUALIZADO COM LIMPEZA DE MENU)
exports.postDeleteProduct = async (req, res) => {
    const prodId = req.body.productId;
    
    try {
        // 1. Primeiro, buscamos o produto para saber qual era a categoria dele
        const doc = await db.collection('products').doc(prodId).get();
        
        if (!doc.exists) {
            return res.redirect('/admin/produtos');
        }

        const prodData = doc.data();

        // 2. Deleta o produto
        await db.collection('products').doc(prodId).delete();

        // 3. Roda a limpeza do menu (Verifica se a categoria ficou vazia)
        if (prodData.category) {
            await cleanUpCategories(prodData.category, prodData.subcategory);
        }

        console.log('Produto Excluído e Menu verificado.');
        res.redirect('/admin/produtos');

    } catch (error) {
        console.log(error);
        res.redirect('/admin/produtos');
    }
};

// 7. CARREGAR TELA DE EDIÇÃO
exports.getEditProduct = async (req, res) => {
    const prodId = req.params.productId;
    try {
        const doc = await db.collection('products').doc(prodId).get();
        if (!doc.exists) return res.redirect('/admin/produtos');

        const product = doc.data();
        product.id = doc.id;

        res.render('admin/edit-product', {
            pageTitle: 'Editar Produto',
            path: '/admin/editar-produto',
            editing: true,
            product: product
        });
    } catch (error) {
        console.log(error);
        res.redirect('/admin/produtos');
    }
};

// 8. SALVAR A EDIÇÃO (COM MEDIDAS DINÂMICAS)
exports.postEditProduct = async (req, res) => {
    const prodId = req.body.productId;
    const body = req.body;

    try {
        // 1. LÓGICA DE IMAGENS (MANTIDA)
        let keptImages = body.keptImages || [];
        if (!Array.isArray(keptImages)) keptImages = [keptImages];

        let newImages = [];
        if (req.files && req.files.length > 0) {
            newImages = req.files.map(f => f.path);
        }

        let finalImages = [...keptImages, ...newImages];
        if (finalImages.length === 0 && body.oldImageUrl) finalImages = [body.oldImageUrl];

        // 2. LÓGICA DE MEDIDAS DINÂMICAS (NOVA)
        // Substituímos o bloco antigo fixo por este que lê as linhas criadas
        let measureList = [];
        
        if (body.measure_names) {
            // Garante que sejam Arrays, mesmo se vier só uma linha
            const names = Array.isArray(body.measure_names) ? body.measure_names : [body.measure_names];
            const pp = Array.isArray(body.measure_PP) ? body.measure_PP : [body.measure_PP];
            const p = Array.isArray(body.measure_P) ? body.measure_P : [body.measure_P];
            const m = Array.isArray(body.measure_M) ? body.measure_M : [body.measure_M];
            const g = Array.isArray(body.measure_G) ? body.measure_G : [body.measure_G];
            const gg = Array.isArray(body.measure_GG) ? body.measure_GG : [body.measure_GG];
            
            // Percorre os arrays e monta os objetos
            for (let i = 0; i < names.length; i++) {
                if (names[i] && names[i].trim() !== '') {
                    measureList.push({
                        name: names[i],
                        PP: pp[i] || '-',
                        P: p[i] || '-',
                        M: m[i] || '-',
                        G: g[i] || '-',
                        GG: gg[i] || '-'
                    });
                }
            }
        }

        // 3. OUTRAS LÓGICAS (CATEGORIA, ARRAYS, PREÇOS - MANTIDAS)
        const finalCategory = (body.categorySelect === 'new' && body.newCategory) ? body.newCategory : body.categorySelect;

        let sizes = body.sizes || []; if (!Array.isArray(sizes)) sizes = [sizes];
        let colors = body.colors || []; if (!Array.isArray(colors)) colors = [colors];

        const price = parseCurrency(body.originalPrice);
        const promo = body.promoPrice ? parseCurrency(body.promoPrice) : null;

        // 4. MONTA O OBJETO FINAL
        const updatedProduct = {
            title: body.title || '',
            sku: body.sku || '', 
            description: body.description || '',
            category: finalCategory,
            subcategory: body.subcategory || '',
            
            images: finalImages,
            imageUrl: finalImages[0] || '', 

            price: promo || price,
            originalPrice: price,
            promoPrice: promo,

            stock: parseInt(body.stock) || 0,
            material: body.material || '', 
            
            sizes: sizes,
            colors: colors,
            
            // AQUI ENTRA A LISTA NOVA DE MEDIDAS
            measures: measureList, 
            
            // Botões e Frete (Mantidos)
            isActive: body.isActive === 'true',
            isNew: body.isNew === 'true',
            isFeatured: body.isFeatured === 'true',

            weight: parseFloat(body.weight) || 0.3,
            height: parseInt(body.height) || 5,
            width: parseInt(body.width) || 20,
            length: parseInt(body.length) || 20,
            
            updatedAt: new Date().toISOString()
        };

        // 5. SALVAR NO BANCO
        await updateCategoryList(finalCategory, body.subcategory);
        await db.collection('products').doc(prodId).update(updatedProduct);
        
        console.log('Produto Editado com Medidas Dinâmicas!');
        res.redirect('/admin/produtos');

    } catch (error) {
        console.log("Erro Edit:", error);
        console.log("Dados recebidos:", JSON.stringify(body, null, 2)); 
        res.redirect('/admin/produtos');
    }
};


// --- FUNÇÃO AUXILIAR PARA LIMPAR CATEGORIAS VAZIAS ---
async function cleanUpCategories(category, subcategory) {
    if (!category) return;
    
    // Normaliza ID (igual usamos para criar)
    const catId = category.toLowerCase().trim();

    try {
        // 1. Verifica se ainda existe ALGUM produto nessa categoria principal
        const catSnapshot = await db.collection('products')
            .where('category', '==', category) // Busca pelo nome original (Ex: "Vestidos")
            .get();

        if (catSnapshot.empty) {
            // Se não sobrou nenhum produto, APAGA A CATEGORIA INTEIRA do menu
            await db.collection('categories').doc(catId).delete();
            console.log(`Categoria ${category} removida do menu (vazia).`);
            return; // Se apagou a principal, não precisa checar subcategoria
        }

        // 2. Se a categoria principal ainda existe, verifica a SUBCATEGORIA
        if (subcategory) {
            const subSnapshot = await db.collection('products')
                .where('category', '==', category)
                .where('subcategory', '==', subcategory)
                .get();

            if (subSnapshot.empty) {
                // Se não sobrou produto nessa subcategoria, remove ela da lista
                const catRef = db.collection('categories').doc(catId);
                const doc = await catRef.get();
                
                if (doc.exists) {
                    const currentSubs = doc.data().subcategories || [];
                    // Filtra removendo a subcategoria vazia
                    const newSubs = currentSubs.filter(sub => sub !== subcategory);
                    
                    await catRef.update({ subcategories: newSubs });
                    console.log(`Subcategoria ${subcategory} removida de ${category}.`);
                }
            }
        }

    } catch (error) {
        console.error("Erro na limpeza de categorias:", error);
    }
};

// ==========================================
// 9. GERENCIAMENTO DE CUPONS
// ==========================================

// Listar Cupons
exports.getCoupons = async (req, res) => {
    try {
        const snapshot = await db.collection('coupons').get();
        const coupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.render('admin/coupons', {
            pageTitle: 'Gerenciar Cupons',
            path: '/admin/cupons',
            coupons: coupons
        });
    } catch (error) {
        console.log(error);
        res.redirect('/admin/produtos');
    }
};

// Criar Cupom (Com validade)
exports.postAddCoupon = async (req, res) => {
    try {
        const code = req.body.code.trim().toUpperCase();
        const discount = parseInt(req.body.discount);
        const expiryDateRaw = req.body.expiryDate; // Vem como "2025-12-31"

        if (!code || !discount || !expiryDateRaw) {
            return res.redirect('/admin/cupons');
        }

        // Configura a data para vencer no FINAL do dia escolhido (23:59:59)
        const expiryDate = new Date(expiryDateRaw);
        expiryDate.setHours(23, 59, 59, 999);

        // Usamos o código como ID
        await db.collection('coupons').doc(code).set({
            code: code,
            discount: discount,
            expiresAt: expiryDate.toISOString(), // Salva data padrão
            active: true,
            createdAt: new Date().toISOString()
        });

        console.log('Cupom criado:', code);
        res.redirect('/admin/cupons');

    } catch (error) {
        console.log(error);
        res.status(500).send("Erro ao criar cupom");
    }
};

// Excluir Cupom
exports.postDeleteCoupon = async (req, res) => {
    const code = req.body.couponCode;
    try {
        await db.collection('coupons').doc(code).delete();
        res.redirect('/admin/cupons');
    } catch (error) {
        console.log(error);
        res.redirect('/admin/cupons');
    }
};

// --- FUNÇÃO AUXILIAR PARA ATUALIZAR O MENU (COM LOGS DE DEBUG) ---
async function updateCategoryList(category, subcategory) {
    console.log(">>> TENTANDO ATUALIZAR MENU...");
    console.log("Categoria recebida:", category);
    
    if (!category) {
        console.log(">>> ERRO: Categoria vazia/nula.");
        return;
    }
    
    // Normaliza para minúsculo para usar como ID
    const catId = category.toLowerCase().trim();
    const catName = category.charAt(0).toUpperCase() + category.slice(1); 
    const subName = subcategory ? (subcategory.charAt(0).toUpperCase() + subcategory.slice(1)) : null;

    try {
        const catRef = db.collection('categories').doc(catId);
        const doc = await catRef.get();

        if (!doc.exists) {
            console.log(">>> CRIANDO NOVA CATEGORIA NO BANCO:", catName);
            await catRef.set({
                name: catName,
                id: catId,
                subcategories: subName ? [subName] : []
            });
        } else {
            console.log(">>> CATEGORIA JÁ EXISTE. VERIFICANDO SUBCATEGORIA...");
            if (subName) {
                const data = doc.data();
                const subs = data.subcategories || [];
                if (!subs.includes(subName)) {
                    console.log(">>> ADICIONANDO SUBCATEGORIA:", subName);
                    subs.push(subName);
                    await catRef.update({ subcategories: subs });
                } else {
                    console.log(">>> SUBCATEGORIA JÁ EXISTE.");
                }
            }
        }
        console.log(">>> MENU ATUALIZADO COM SUCESSO!");
    } catch (error) {
        console.error(">>> ERRO GRAVE AO SALVAR CATEGORIA:", error);
    }
};

// 10. SINCRONIZAR MENU (Limpar categorias vazias antigas)
exports.postRefreshMenu = async (req, res) => {
    console.log("--- INICIANDO LIMPEZA DO MENU ---");
    try {
        // 1. Pega todas as categorias cadastradas no menu
        const categoriesSnap = await db.collection('categories').get();
        
        if (categoriesSnap.empty) {
            console.log("Nenhuma categoria para limpar.");
            return res.redirect('/admin/produtos');
        }

        // 2. Verifica uma por uma
        for (const doc of categoriesSnap.docs) {
            const catId = doc.id; // Ex: "vestidos"
            
            // Busca se existe algum produto com essa categoria
            const productsSnap = await db.collection('products')
                .where('category', '==', catId)
                .limit(1) // Basta achar 1 para saber que não está vazia
                .get();

            if (productsSnap.empty) {
                // Se não achou nenhum produto, APAGA A CATEGORIA
                console.log(`Categoria '${catId}' está vazia. Apagando...`);
                await db.collection('categories').doc(catId).delete();
            }
        }

        console.log("Limpeza concluída!");
        res.redirect('/admin/produtos');

    } catch (error) {
        console.log("Erro ao limpar menu:", error);
        res.redirect('/admin/produtos');
    }
};