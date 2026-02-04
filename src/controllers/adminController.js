const { db } = require('../config/firebase');
const emailService = require('../services/emailService'); 

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
        
        // 1. Multifotos (Cloudinary)
        let images = [];
        if (req.files && req.files.length > 0) {
            images = req.files.map(f => f.path);
        } else {
            return res.status(422).send("Pelo menos uma foto é obrigatória.");
        }

        // --- LÓGICA DE MEDIDAS DINÂMICO ---
        let measureList = [];
        if (body.measure_names) {
            const names = Array.isArray(body.measure_names) ? body.measure_names : [body.measure_names];
            const pp = Array.isArray(body.measure_PP) ? body.measure_PP : [body.measure_PP];
            const p = Array.isArray(body.measure_P) ? body.measure_P : [body.measure_P];
            const m = Array.isArray(body.measure_M) ? body.measure_M : [body.measure_M];
            const g = Array.isArray(body.measure_G) ? body.measure_G : [body.measure_G];
            const gg = Array.isArray(body.measure_GG) ? body.measure_GG : [body.measure_GG];
            
            for (let i = 0; i < names.length; i++) {
                if (names[i].trim() !== '') { 
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

        // 2. Definir Categoria (Final)
        const finalCategory = (body.categorySelect === 'new' && body.newCategory) ? body.newCategory : body.categorySelect;

        // 3. Definir Subcategoria (CORREÇÃO AQUI) ⚠️
        // Lógica: Tenta pegar do Select. Se for 'new' ou vazio, pega do Input de Texto.
        let finalSubcategory = body.subcategorySelect;
        
        if (finalSubcategory === 'new' || !finalSubcategory) {
            finalSubcategory = body.newSubcategory;
        }
        
        // Garantia final: Se ainda for vazio/undefined, vira string vazia
        if (!finalSubcategory) finalSubcategory = '';

        // 4. Tratamento de Arrays e Preços
        let sizes = Array.isArray(body.sizes) ? body.sizes : (body.sizes ? [body.sizes] : []);
        let colors = Array.isArray(body.colors) ? body.colors : (body.colors ? [body.colors] : []);

        const price = parseCurrency(body.originalPrice);
        const promo = body.promoPrice ? parseCurrency(body.promoPrice) : null;
        
        let finalPrice = price;
        if (promo && promo > 0 && promo < price) finalPrice = promo;

        let variations = [];
        let totalStockCalculated = 0;

        // Cruzamos as cores selecionadas com os tamanhos selecionados
        colors.forEach(c => {
            sizes.forEach(s => {
                // MUDANÇA AQUI: .toLowerCase() é essencial
                const cleanColor = c.replace('#', '').toLowerCase(); 
                const fieldName = `v_stock_${cleanColor}_${s}`;
                
                const qty = parseInt(body[fieldName] || 0);

                variations.push({
                    color: c, 
                    size: s,
                    stock: qty
                });

                totalStockCalculated += qty;
            });
        });

        const newProduct = {
            // Dados Básicos
            title: body.title,
            sku: body.sku || '',
            description: body.description,
            
            category: finalCategory,
            subcategory: finalSubcategory, // <--- Agora usa a variável calculada certa
            
            // Imagens
            images: images, 
            imageUrl: images[0], 

            // Preços
            price: finalPrice, 
            originalPrice: price,
            promoPrice: promo,

            // Detalhes
           stock: totalStockCalculated, // Agora usa a soma automática da grade
           variations: variations,      // Salva o array com cada cor/tamanho
            material: body.material || '',
            
            // Arrays
            sizes: sizes,
            colors: colors, 

            // Visibilidade
            isActive: body.isActive === 'true',
            isNew: body.isNew === 'true',
            isFeatured: body.isFeatured === 'true', // Faltava esse

            // Frete
            weight: parseFloat(body.weight) || 0.3,
            height: parseInt(body.height) || 5,
            width: parseInt(body.width) || 20,
            length: parseInt(body.length) || 20,

            // Medidas Dinâmicas
            measures: measureList, 

            createdAt: new Date().toISOString()
        };
        
        // Atualiza menu lateral usando a mesma variável
        await updateCategoryList(finalCategory, finalSubcategory);
        
        await db.collection('products').add(newProduct);
        console.log(`Produto Criado! Cat: ${finalCategory} | Sub: ${finalSubcategory}`);
        res.redirect('/admin/produtos');

    } catch (error) {
        console.log("Erro Add:", error);
        res.status(500).send("Erro no servidor: " + error.message);
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
        // 1. Busca dados do pedido para pegar o e-mail do cliente
        const doc = await db.collection('orders').doc(orderId).get();
        if (!doc.exists) return res.redirect('/admin/pedidos');
        
        const orderData = doc.data();

        // 2. Atualiza no Banco
        await db.collection('orders').doc(orderId).update({ 
            status: status, 
            trackingCode: trackingCode || '' 
        });

        // 3. Envia E-mail de Aviso (Se o status mudou para algo importante)
        if (status === 'Aguardando Retirada' || status === 'Enviado') {
            await emailService.sendOrderStatusEmail(
                orderData.user.email, 
                orderData.user.name, 
                orderId, 
                status
            );
        }

        console.log(`Status atualizado e e-mail enviado: ${status}`);
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

        // --- ORDENAÇÃO: MAIS RECENTE PRIMEIRO ---
        products.sort((a, b) => {
            // Se o produto for muito antigo e não tiver data, assume data 0
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA; // Data maior (mais nova) vem primeiro
        });
        // ----------------------------------------

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

// 8. SALVAR A EDIÇÃO (CORRIGIDO E SEGURO)
exports.postEditProduct = async (req, res) => {
    console.log("CONTEÚDO DO BODY:", req.body);
    const prodId = req.body.productId;
    const body = req.body;

    try {
        // 1. LÓGICA DE IMAGENS
        let keptImages = body.keptImages || [];
        if (!Array.isArray(keptImages)) keptImages = [keptImages];

        let newImages = [];
        if (req.files && req.files.length > 0) {
            newImages = req.files.map(f => f.path);
        }

        let finalImages = [...keptImages, ...newImages];
        if (finalImages.length === 0 && body.oldImageUrl) finalImages = [body.oldImageUrl];

        // 2. LÓGICA DE MEDIDAS DINÂMICAS
        let measureList = [];
        if (body.measure_names) {
            const names = Array.isArray(body.measure_names) ? body.measure_names : [body.measure_names];
            const pp = Array.isArray(body.measure_PP) ? body.measure_PP : [body.measure_PP];
            const p = Array.isArray(body.measure_P) ? body.measure_P : [body.measure_P];
            const m = Array.isArray(body.measure_M) ? body.measure_M : [body.measure_M];
            const g = Array.isArray(body.measure_G) ? body.measure_G : [body.measure_G];
            const gg = Array.isArray(body.measure_GG) ? body.measure_GG : [body.measure_GG];
            
            for (let i = 0; i < names.length; i++) {
                if (names[i] && names[i].trim() !== '') {
                    measureList.push({
                        name: names[i],
                        PP: pp[i] || '-', P: p[i] || '-', M: m[i] || '-', G: g[i] || '-', GG: gg[i] || '-'
                    });
                }
            }
        }

        // 3. CATEGORIA E SUBCATEGORIA
        const finalCategory = (body.categorySelect === 'new' && body.newCategory) ? body.newCategory : body.categorySelect;
        let finalSubcategory = body.subcategorySelect === 'new' || !body.subcategorySelect ? body.newSubcategory : body.subcategorySelect;
        if (!finalSubcategory) finalSubcategory = body.subcategory || '';

        // 4. PREÇOS E FORMATAÇÃO
        const price = parseCurrency(body.originalPrice);
        const promo = body.promoPrice ? parseCurrency(body.promoPrice) : null;
        let finalPrice = (promo && promo > 0 && promo < price) ? promo : price;

        // 5. LÓGICA DE GRADE DE ESTOQUE (VARIAÇÕES)
        let variations = [];
        let totalStockCalculated = 0;
        let colorsArray = Array.isArray(body.colors) ? body.colors : (body.colors ? [body.colors] : []);
        let sizesArray = Array.isArray(body.sizes) ? body.sizes : (body.sizes ? [body.sizes] : []);

        colorsArray.forEach(c => {
            sizesArray.forEach(s => {
                const cleanColor = c.replace('#', '').toLowerCase();
                const fieldName = `v_stock_${cleanColor}_${s}`;
                const qty = parseInt(req.body[fieldName] || 0);

                variations.push({
                    color: c,
                    size: s,
                    stock: qty
                });
                totalStockCalculated += qty;
            });
        });

        // 6. MONTAGEM DO OBJETO ÚNICO (Sem duplicatas)
        const updatedProduct = {
            title: body.title || '',
            sku: body.sku || '', 
            description: body.description || '',
            category: finalCategory,
            subcategory: finalSubcategory,
            images: finalImages,
            imageUrl: finalImages[0] || '', 
            price: finalPrice,
            originalPrice: price,
            promoPrice: promo,
            stock: totalStockCalculated,
            variations: variations,
            material: body.material || '', 
            sizes: sizesArray,
            colors: colorsArray,
            measures: measureList, 
            isActive: body.isActive === 'true',
            isNew: body.isNew === 'true',
            isFeatured: body.isFeatured === 'true',
            weight: parseFloat(body.weight) || 0.3,
            height: parseInt(body.height) || 5,
            width: parseInt(body.width) || 20,
            length: parseInt(body.length) || 20,
            updatedAt: new Date().toISOString()
        };

        // 7. ATUALIZA NO BANCO DE DADOS
        await updateCategoryList(finalCategory, finalSubcategory);
        await db.collection('products').doc(prodId).update(updatedProduct);
        
        console.log('Produto Editado com Sucesso!');
        res.redirect('/admin/produtos');

    } catch (error) {
        console.log("Erro Edit:", error);
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
        const expiryDateRaw = req.body.expiryDate; 
        
        // --- NOVO: Captura o limite de uso (padrão 1 se vier vazio) ---
        const usageLimit = parseInt(req.body.usageLimit) || 1;

        if (!code || !discount || !expiryDateRaw) {
            return res.redirect('/admin/cupons');
        }

        const expiryDate = new Date(expiryDateRaw);
        expiryDate.setHours(23, 59, 59, 999);

        // Salva no Firestore
        await db.collection('coupons').doc(code).set({
            code: code,
            discount: discount,
            usageLimit: usageLimit, // <--- SALVANDO O LIMITE AQUI
            expiresAt: expiryDate.toISOString(),
            active: true,
            createdAt: new Date().toISOString()
        });

        console.log(`Cupom ${code} criado com limite de ${usageLimit} por cliente.`);
        res.redirect('/admin/cupons');

    } catch (error) {
        console.log("Erro ao criar cupom:", error);
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

// --- FUNÇÃO AUXILIAR PARA ATUALIZAR O MENU (CORRIGIDA) ---
async function updateCategoryList(category, subcategory) {
    // Validação básica
    if (!category || typeof category !== 'string') return;
    
    // Normaliza para ID (sem espaços, minúsculo)
    const catId = category.toLowerCase().trim();
    // Nome Bonito (Primeira Maiúscula)
    const catName = category.charAt(0).toUpperCase() + category.slice(1);
    
    // Prepara a Subcategoria (se existir)
    let subName = null;
    if (subcategory && typeof subcategory === 'string' && subcategory.trim() !== '') {
        const s = subcategory.trim();
        subName = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); // Ex: "Festa"
    }

    try {
        const catRef = db.collection('categories').doc(catId);
        const doc = await catRef.get();

        if (!doc.exists) {
            // === CASO 1: CATEGORIA NOVA (AQUI ESTAVA O BUG) ===
            // Cria a categoria JÁ COM a subcategoria dentro da lista
            console.log(`Criando categoria nova: ${catName} com sub: ${subName}`);
            await catRef.set({
                name: catName,
                id: catId,
                subcategories: subName ? [subName] : [] // Se tem sub, cria a lista com ela
            });

        } else {
            // === CASO 2: CATEGORIA JÁ EXISTE ===
            // Apenas adiciona a subcategoria se ela não estiver lá
            if (subName) {
                const data = doc.data();
                let subs = data.subcategories || [];

                // Verifica duplicidade (ignorando maiúscula/minúscula)
                const exists = subs.some(s => s.toLowerCase() === subName.toLowerCase());

                if (!exists) {
                    console.log(`Adicionando sub '${subName}' em '${catName}'`);
                    subs.push(subName);
                    await catRef.update({ subcategories: subs });
                }
            }
        }
    } catch (error) {
        console.error("Erro ao atualizar menu de categorias:", error);
    }
}

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

// EXCLUIR PEDIDO (ADMIN)
exports.postDeleteOrder = async (req, res) => {
    const orderId = req.body.orderId;
    try {
        await db.collection('orders').doc(orderId).delete();
        console.log('Pedido excluído:', orderId);
        res.redirect('/admin/pedidos');
    } catch (error) {
        console.error("Erro ao excluir pedido:", error);
        res.redirect('/admin/pedidos');
    }
};

// 11. GESTÃO DE CATEGORIAS (CORRIGIDO)
exports.getManageCategories = async (req, res) => {
    try {
        // 1. Busca dados
        const catSnap = await db.collection('categories').get();
        const prodSnap = await db.collection('products').get();
        
        const products = prodSnap.docs.map(doc => doc.data());
        const totalGlobal = products.length; 

        let categories = [];

        // 2. Monta a lista
        catSnap.forEach(doc => {
            const catData = doc.data();
            const catId = doc.id; // Ex: "teste"
            
            // Filtra produtos dessa categoria principal (pelo ID para ser exato)
            const catProducts = products.filter(p => 
                (p.category || '').toLowerCase().trim() === catId.toLowerCase().trim()
            );
            const totalCat = catProducts.length;

            // Analisa as Subcategorias
            const rawSubs = catData.subcategories || [];
            const subDetails = rawSubs.map(subName => {
                
                // --- AQUI ESTAVA O PROBLEMA ---
                // Agora convertemos tudo para minúsculo e tiramos espaços antes de comparar
                const count = catProducts.filter(p => 
                    (p.subcategory || '').trim().toLowerCase() === subName.trim().toLowerCase()
                ).length;
                // ------------------------------

                return { name: subName, count: count };
            });

            categories.push({
                id: catId,
                name: catData.name,
                count: totalCat,
                subs: subDetails 
            });
        });

        res.render('admin/manage-categories', {
            pageTitle: 'Gerenciar Categorias',
            path: '/admin/categorias',
            categories: categories,
            totalGlobal: totalGlobal 
        });

    } catch (error) {
        console.log("Erro ao carregar categorias:", error);
        res.redirect('/admin/produtos');
    }
};

// NOVA FUNÇÃO: EXCLUIR APENAS UMA SUBCATEGORIA
exports.postDeleteSubCategory = async (req, res) => {
    const { categoryId, subName } = req.body;
    
    // Importamos admin aqui caso não esteja no topo
    const admin = require('firebase-admin');

    try {
        await db.collection('categories').doc(categoryId).update({
            // Remove o item específico do array
            subcategories: admin.firestore.FieldValue.arrayRemove(subName)
        });
        console.log(`Subcategoria '${subName}' removida de '${categoryId}'.`);
        res.redirect('/admin/categorias');
    } catch (error) {
        console.error("Erro ao apagar subcategoria:", error);
        res.redirect('/admin/categorias');
    }
};


exports.postDeleteCategory = async (req, res) => {
    const catId = req.body.categoryId;
    try {
        // Apaga a categoria do banco de menu
        await db.collection('categories').doc(catId).delete();
        console.log(`Categoria ${catId} removida.`);
        res.redirect('/admin/categorias');
    } catch (error) {
        console.log(error);
        res.redirect('/admin/categorias');
    }
};

// --- FUNÇÃO DE ANIVERSARIANTES ---
exports.getBirthdays = async (req, res) => {
    try {
        // 1. Pega a data de hoje
        const hoje = new Date();
        const mesAtual = (hoje.getMonth() + 1).toString().padStart(2, '0'); // Ex: "01", "02"
        const diaAtual = hoje.getDate().toString().padStart(2, '0');

        // 2. Busca todos os usuários que preencheram o aniversário
        const snapshot = await db.collection('users').where('birthday', '!=', '').get();
        
        const todosAniversariantes = [];
        const aniversariantesHoje = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            // O formato salvo é YYYY-MM-DD
            const [ano, mes, dia] = data.birthday.split('-');

            if (mes === mesAtual) {
                const user = {
                    id: doc.id,
                    name: data.name,
                    phone: data.phone,
                    email: data.email,
                    day: dia,
                    isToday: (dia === diaAtual)
                };

                if (user.isToday) {
                    aniversariantesHoje.push(user);
                } else {
                    todosAniversariantes.push(user);
                }
            }
        });

        // Ordena por dia do mês
        todosAniversariantes.sort((a, b) => a.day - b.day);

        res.render('admin/birthdays', {
            pageTitle: 'Aniversariantes do Mês',
            path: '/admin/aniversariantes',
            hoje: aniversariantesHoje,
            doMes: todosAniversariantes
        });

    } catch (error) {
        console.log("Erro ao buscar aniversariantes:", error);
        res.redirect('/admin/pedidos');
    }
};

exports.getUsers = async (req, res) => {
    try {
        const searchTerm = req.query.search ? req.query.search.toLowerCase() : '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Quantos clientes aparecem por vez

        // 1. Busca todos os usuários (No Firebase, para filtros complexos de texto, 
        // o ideal é puxar e filtrar ou usar serviços externos, mas para o tamanho 
        // atual, filtrar no código funciona bem).
        const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
        let allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const totalAbsoluto = allUsers.length;

        // 2. Filtro de Busca (Nome ou Email)
        if (searchTerm) {
            allUsers = allUsers.filter(u => 
                (u.name && u.name.toLowerCase().includes(searchTerm)) || 
                (u.email && u.email.toLowerCase().includes(searchTerm))
            );
        }

        // 3. Lógica de Paginação
        const totalEncontrados = allUsers.length;
        const totalPages = Math.ceil(totalEncontrados / limit);
        const startIndex = (page - 1) * limit;
        const paginatedUsers = allUsers.slice(startIndex, startIndex + limit);

        res.render('admin/users', {
            pageTitle: 'Gestão de Clientes',
            path: '/admin/clientes',
            users: paginatedUsers,
            searchTerm: req.query.search || '', // Devolve o termo para o input não esvaziar
            currentPage: page,
            totalPages: totalPages,
            totalAbsoluto: totalAbsoluto,
            totalEncontrados: totalEncontrados
        });
    } catch (error) {
        console.log("Erro ao buscar clientes:", error);
        res.redirect('/admin');
    }
};