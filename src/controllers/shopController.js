const shippingService = require("../services/shippingService");
const { db } = require("../config/firebase");
const QRCode = require("qrcode");
const paymentService = require("../services/paymentService");
const admin = require("firebase-admin");
const { MercadoPagoConfig, Payment } = require('mercadopago');

// Inicializa o Mercado Pago para que o Webhook consiga consultar os pagamentos
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});
const payment = new Payment(client);

// ==========================================
// 1. VITRINE E PRODUTOS
// ==========================================

exports.getIndex = async (req, res) => {
  const ITENS_POR_PAGINA = 16;
  const page = parseInt(req.query.page) || 1;

  try {
    // --- 1. BUSCA OS PRODUTOS (Sua lógica atual) ---
    const snapshot = await db.collection("products").get();
    let allProducts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // --- 2. BUSCA OS BANNERS (CÓDIGO NOVO) ---
    const bannerSnapshot = await db.collection("banners").orderBy("createdAt", "desc").get();
    const banners = bannerSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 1. ORDENAÇÃO PRODUTOS
    allProducts.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    // 2. PAGINAÇÃO
    const totalItems = allProducts.length;
    const totalPages = Math.ceil(totalItems / ITENS_POR_PAGINA);
    const startIndex = (page - 1) * ITENS_POR_PAGINA;
    const endIndex = page * ITENS_POR_PAGINA;
    const paginatedProducts = allProducts.slice(startIndex, endIndex);

    // --- 3. RENDERIZA COM OS BANNERS ---
    res.render("shop/home", {
      pageTitle: "Home - Maely Cristina",
      products: paginatedProducts,
      banners: banners, // <--- ADICIONADO AQUI
      path: "/",
      currentPage: page,
      totalPages: totalPages,
      totalItems: totalItems,
    });
  } catch (error) {
    console.log("Erro Home:", error);
    res.render("shop/home", {
      pageTitle: "Home",
      products: [],
      banners: [], // <--- GARANTE QUE NÃO QUEBRE SE DER ERRO
      path: "/",
      currentPage: 1,
      totalPages: 1,
    });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const prodId = req.params.productId;
    const doc = await db.collection("products").doc(prodId).get();

    if (!doc.exists) return res.redirect("/");

    const productData = doc.data();
    productData.id = doc.id;

    // 1. Busca Produtos Relacionados (Mesma categoria)
    const relatedSnapshot = await db
      .collection("products")
      .where("category", "==", productData.category)
      .limit(5)
      .get();

    // Filtra para não mostrar o próprio produto que estamos vendo
    let relatedProducts = relatedSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((p) => p.id !== prodId)
      .slice(0, 4);

    // 2. Busca Avaliações
    const reviewsSnapshot = await db
      .collection("reviews")
      .where("productId", "==", prodId)
      .orderBy("date", "desc")
      .get();

    const reviews = reviewsSnapshot.docs.map((doc) => doc.data());

    res.render("shop/product-detail", {
      pageTitle: productData.title,
      product: productData,
      relatedProducts: relatedProducts,
      reviews: reviews,
      path: "/produtos",
    });
  } catch (error) {
    console.log(error);
    res.redirect("/");
  }
};

// ==========================================
// 2. CARRINHO
// ==========================================

exports.getCart = async (req, res) => {
  try {
    let cart = req.session.cart || { items: [], totalQty: 0, totalPrice: 0 };

    if (!cart.items || cart.items.length === 0) {
      return res.render("shop/cart", {
        pageTitle: "Sua Sacola",
        path: "/carrinho",
        cart: cart,
        errorMessage: res.locals.errorMessage,
        successMessage: res.locals.successMessage,
      });
    }

    const updatedItems = [];
    let itemRemoved = false;
    let priceChanged = false;
    let stockAdjusted = false; // Nova flag para aviso de estoque

    for (let item of cart.items) {
      const productDoc = await db.collection("products").doc(item.productId).get();

      if (productDoc.exists) {
        const productData = productDoc.data();

        // --- INÍCIO DA AUDITORIA DE ESTOQUE POR VARIAÇÃO ---
        const variacaoReal = productData.variations 
          ? productData.variations.find(v => v.color === item.color && v.size === item.size) 
          : null;
        
        const estoqueDisponivel = variacaoReal ? parseInt(variacaoReal.stock) : 0;

        // Caso 1: O estoque daquela cor/tamanho acabou totalmente
        if (estoqueDisponivel <= 0) {
          itemRemoved = true;
          continue; // Pula este item (remove do carrinho atualizado)
        }

        // Caso 2: O estoque diminuiu e o cliente tem mais do que o disponível
        if (item.qty > estoqueDisponivel) {
          item.qty = estoqueDisponivel;
          stockAdjusted = true;
        }
        // --- FIM DA AUDITORIA DE ESTOQUE ---

        // Verifica se o preço mudou
        if (parseFloat(productData.price) !== parseFloat(item.price)) {
          item.price = parseFloat(productData.price);
          priceChanged = true;
        }

        item.title = productData.title;
        item.imageUrl = productData.imageUrl;

        updatedItems.push(item);
      } else {
        itemRemoved = true;
      }
    }

    cart.items = updatedItems;

    // Recalculo Total
    let somaReal = 0;
    let qtdReal = 0;
    cart.items.forEach((item) => {
      somaReal += parseFloat(item.price) * parseInt(item.qty);
      qtdReal += parseInt(item.qty);
    });

    cart.totalPrice = somaReal;
    cart.totalQty = qtdReal;

    if (cart.coupon) {
      const factor = (100 - cart.coupon.percent) / 100;
      cart.totalWithDiscount = cart.totalPrice * factor;
    }

    req.session.cart = cart;

    // MENSAGENS DE FEEDBACK
    let msgFinal = res.locals.errorMessage;

    if (!msgFinal || msgFinal.length === 0) {
      if (itemRemoved) {
        msgFinal = "Alguns itens esgotaram e foram removidos da sua sacola.";
      } else if (stockAdjusted) {
        msgFinal = "A quantidade de alguns itens foi ajustada de acordo com o estoque disponível.";
      } else if (priceChanged) {
        msgFinal = "Os preços de alguns produtos foram atualizados.";
      }
    }

    res.render("shop/cart", {
      pageTitle: "Sua Sacola",
      path: "/carrinho",
      cart: cart,
      errorMessage: msgFinal,
      successMessage: res.locals.successMessage,
    });
  } catch (error) {
    console.error("Erro ao carregar/validar carrinho:", error);
    res.status(500).render("500", { pageTitle: "Erro", path: "/500" });
  }
};

// 1. ADICIONAR AO CARRINHO (COM CONTROLE RIGOROSO DE ESTOQUE)
exports.postCart = async (req, res) => {
  try {
    const prodId = req.body.productId;
    const size = req.body.size;
    const color = req.body.color;

    // 1. Busca dados atualizados do produto
    const doc = await db.collection("products").doc(prodId).get();
    if (!doc.exists) return res.redirect("/");
    const product = doc.data();

    // --- TRAVA 1: Busca o estoque da VARIAÇÃO selecionada ---
    // Procuramos no array de variações o objeto que tenha a COR e o TAMANHO exatos
    const variacaoSelecionada = product.variations
      ? product.variations.find((v) => v.color === color && v.size === size)
      : null;

    // Se a variação existir, pegamos o estoque dela. Se não existir, consideramos 0.
    const estoqueReal = variacaoSelecionada
      ? parseInt(variacaoSelecionada.stock)
      : 0;

    if (estoqueReal <= 0) {
      req.flash("error", "Esta cor e tamanho não estão mais disponíveis!");
      return res.redirect(`/produto/${prodId}`);
    }

    // 2. Prepara o carrinho
    if (!req.session.cart)
      req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
    const cart = req.session.cart;

    // 3. Verifica se o item já está no carrinho
    const existingItemIndex = cart.items.findIndex(
      (item) =>
        item.productId === prodId && item.size === size && item.color === color
    );

    // --- TRAVA 2: Verifica a quantidade acumulada ---
    let qtdNoCarrinho = 0;
    if (existingItemIndex >= 0) {
      qtdNoCarrinho = cart.items[existingItemIndex].qty;
    }

    if (qtdNoCarrinho + 1 > estoqueReal) {
      // Mensagem mais específica
      req.flash(
        "error",
        `Estoque insuficiente! Só temos ${estoqueReal} unidades no tamanho ${size} e cor selecionada.`
      );
      return res.redirect("/carrinho");
    }

    // 4. Adiciona ou Incrementa
    if (existingItemIndex >= 0) {
      cart.items[existingItemIndex].qty += 1;
    } else {
      cart.items.push({
        productId: prodId,
        title: product.title,
        price: parseFloat(product.price),
        imageUrl: product.imageUrl,
        size: size,
        color: color || "Única",
        qty: 1,
      });
    }

    // 5. Atualiza Totais
    cart.totalQty += 1;
    cart.totalPrice += parseFloat(product.price);

    // 6. Recalcula desconto do cupom (se tiver um ativo) para manter o preço certo
    if (cart.coupon) {
      const factor = (100 - cart.coupon.percent) / 100;
      cart.totalWithDiscount = cart.totalPrice * factor;
    }

    // 7. Salva no Banco se estiver logado
    if (req.session.user) {
      await db
        .collection("users")
        .doc(req.session.user.id)
        .update({
          cart: cart,
        })
        .catch((e) => console.log("Erro ao salvar carrinho no banco", e));
    }

    req.session.save((err) => {
      if (err) console.log(err);
      res.redirect("/carrinho");
    });
  } catch (error) {
    console.log("Erro no postCart:", error);
    res.redirect("/");
  }
};

exports.postCartDeleteProduct = async (req, res) => {
  const prodId = req.body.productId;
  const size = req.body.size;
  const color = req.body.color; // <--- Pega a cor do formulário

  const cart = req.session.cart;

  if (!cart) return res.redirect("/carrinho");

  // Procura o item que tenha ID, Tamanho E Cor iguais
  const itemIndex = cart.items.findIndex(
    (item) =>
      item.productId === prodId &&
      item.size === size &&
      (item.color || "") === color // Compara a cor (trata vazios)
  );

  if (itemIndex >= 0) {
    const item = cart.items[itemIndex];
    // Subtrai do total geral
    cart.totalQty -= item.qty;
    cart.totalPrice -= item.price * item.qty;

    // Remove do array
    cart.items.splice(itemIndex, 1);
  }

  // --- SALVA NO BANCO SE ESTIVER LOGADO ---
  if (req.session.user) {
    await db
      .collection("users")
      .doc(req.session.user.id)
      .update({
        cart: cart,
      })
      .catch((e) => console.log("Erro ao atualizar carrinho", e));
  }
  // ----------------------------------------

  req.session.save(() => res.redirect("/carrinho"));
};

// ==========================================
// 3. CHECKOUT E PEDIDO (SIMULAÇÃO)
// ==========================================

exports.getCheckout = (req, res) => {
  if (!req.session.cart || req.session.cart.items.length === 0)
    return res.redirect("/carrinho");
  if (!req.session.isLoggedIn) return res.redirect("/login");

  res.render("shop/checkout", {
    pageTitle: "Finalizar Compra",
    path: "/checkout",
    cart: req.session.cart,
    user: req.session.user,
  });
};

exports.postOrder = async (req, res) => {
  console.log("--- INICIANDO PEDIDO ---");

  // 1. LOG DE DEPURAÇÃO (Para ver o que chega do formulário)
  // Isso vai aparecer no seu terminal e nos logs do Render
  console.log("MÉTODO:", req.body.paymentMethod);
  console.log("DADOS RECEBIDOS:", JSON.stringify(req.body, null, 2));

  try {
    const user = req.session.user;
    const cart = req.session.cart;
    const paymentMethod = req.body.paymentMethod;

    // Limpeza de CPF e Telefone
    const cpf = req.body.cpf ? req.body.cpf.replace(/\D/g, "") : "";
    const phone = req.body.phone ? req.body.phone.replace(/\D/g, "") : "";

    // Frete
    const shippingCost = parseFloat(req.body.shippingCost) || 0;
    const shippingMethod = req.body.shippingMethod || "A combinar";

    // Validações Básicas
    if (!cart || cart.items.length === 0) return res.redirect("/carrinho");
    if (!cpf) {
      req.flash("error", "CPF é obrigatório.");
      return res.redirect("/checkout");
    }

    // Atualiza usuário no banco (se tiver telefone novo)
    if (user && user.id) {
      await db
        .collection("users")
        .doc(user.id)
        .update({ cpf, phone })
        .catch(() => {});
    }

   // --- CÁLCULO TOTAL (ATUALIZADO) ---
    // 1. Criamos a âncora: Preço das peças com cupom, mas SEM o desconto do PIX ainda.
    const priceBasePecas = cart.totalWithDiscount || cart.totalPrice; 
    
    let pixDiscountAmount = 0;
    let finalPricePecas = priceBasePecas; // Variável que pode ou não sofrer desconto

    // 2. Se for PIX, calculamos o desconto, mas a "priceBasePecas" continua intacta.
    if (paymentMethod === "pix") {
      await baixarEstoqueDasVariacoes(cart.items);
      pixDiscountAmount = priceBasePecas * 0.05; 
      finalPricePecas = priceBasePecas - pixDiscountAmount; 
    }

    // 3. O total final é a soma do preço das peças (com ou sem desconto) + frete.
    const finalTotalPrice = parseFloat((finalPricePecas + shippingCost).toFixed(2));

    // Monta Pedido (Versão Corrigida sem duplicidade)
    // Monta Pedido (Versão Corrigida)
    const orderData = {
      user: { id: user.id, email: user.email, name: user.name, cpf, phone },
      items: cart.items,
      subtotal: cart.totalPrice, // Valor bruto sem cupom
      baseProdutos: priceBasePecas, // Valor com cupom, mas SEM desconto PIX
      pixDiscount: pixDiscountAmount, 
      discountTotal: finalPricePecas, // <--- CORRIGIDO (era aqui o erro de 'priceBase')
      shippingCost,
      shippingMethod,
      couponUsed: cart.coupon ? cart.coupon.code : null,
      totalPrice: finalTotalPrice, 
      address: {
        cep: req.body.cep,
        rua: req.body.rua,
        numero: req.body.numero,
        bairro: req.body.bairro,
        cidade: req.body.cidade,
        estado: req.body.estado,
      },
      date: new Date().toISOString(),
      status: "Aguardando Pagamento",
      // Se for pix, salva PIX. Se não, verifica se é débito ou crédito.
      paymentMethod: paymentMethod === "pix" 
      ? "PIX" 
      : (req.body.cardType === "debit" ? "Cartão de Débito" : "Cartão de Crédito"),
    };

    const orderRef = await db.collection("orders").add(orderData);
    const orderId = orderRef.id;

    

    // 3. PAGAMENTO
    if (paymentMethod === "pix") {
      // Lógica do Pix
      const pixData = await paymentService.gerarPixPagSeguro(
        { id: orderId, totalPrice: finalTotalPrice },
        { ...user, phone },
        cpf
      );
      const qrCodeImage = await QRCode.toDataURL(pixData.qrCodeText);
      await orderRef.update({
        pagseguroId: pixData.id,
        pixCode: pixData.qrCodeText,
      });
      req.session.cart = null;
      return res.render("shop/success-pix", {
        pageTitle: "Pagar com PIX",
        path: "",
        qrCodeImage,
        pixCode: pixData.qrCodeText,
        total: finalTotalPrice,
      });
    } else {
      // --- CARTÃO MERCADO PAGO (VERSÃO ATUALIZADA) ---
      const cardToken = req.body.cardToken;
      const paymentMethodId = req.body.paymentMethodId; // ex: visa, master
      const issuerId = req.body.issuerId;               // ID do Banco Emissor
      const installments = req.body.installments;

      // Log para conferência no terminal
      console.log(`Tentando cobrança: ${paymentMethodId} | Token: ${cardToken ? 'OK' : 'FALHOU'}`);

      if (!cardToken || !paymentMethodId) {
        throw new Error("Não foi possível identificar seu cartão. Verifique os dados e tente novamente.");
      }

      // Chamamos o serviço passando agora o issuerId como 7º parâmetro
      const cardResult = await paymentService.processarCartaoPagSeguro(
        { id: orderId, totalPrice: finalTotalPrice },
        user,
        cpf,
        cardToken,
        installments,
        paymentMethodId,
        issuerId // <--- ADICIONADO AQUI
      );

      // Verificamos se o Mercado Pago aprovou
      if (cardResult.status === 'Pago / Aprovado') {
        await baixarEstoqueDasVariacoes(cart.items);
        await orderRef.update({ 
            status: 'Pago / Aprovado', 
            mercadoPagoId: cardResult.id 
        });
        
        req.session.cart = null; // Limpa a sacola
        return res.render('shop/success', { pageTitle: 'Compra Aprovada!', path: '' });
      } else {
        // Se o cartão for recusado (falta de limite, por exemplo)
        await orderRef.update({ status: 'Recusado' });
        req.flash('error', 'O pagamento não foi aprovado. Motivo: ' + (cardResult.message || 'Dados incorretos ou limite insuficiente.'));
        return res.redirect('/checkout');
      }
    }
  } catch (error) {
    console.error("ERRO NO CHECKOUT (PostOrder):", error);
    req.flash("error", "Erro ao processar: " + error.message);
    res.redirect("/checkout");
  }
};

// ==========================================
// 4. ÁREA DO CLIENTE
// ==========================================

exports.getOrders = async (req, res) => {
  if (!req.session.isLoggedIn) return res.redirect("/login");

  try {
    const snapshot = await db
      .collection("orders")
      .where("user.id", "==", req.session.user.id)
      .get();
    
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // --- ADICIONE ESTA LINHA ABAIXO PARA ORDENAR (Mais novo primeiro) ---
    orders.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.render("shop/orders", {
      pageTitle: "Meus Pedidos",
      path: "/pedidos",
      orders: orders,
    });
  } catch (error) {
    console.log(error);
    res.redirect("/");
  }
};

// ==========================================
// 5. NOVA FUNÇÃO PARA SALVAR AVALIAÇÃO
// ==========================================

exports.postReview = async (req, res) => {
  const user = req.session.user;
  const { productId, rating, comment } = req.body;

  if (!user) {
    // Se usar connect-flash:
    // req.flash('error', 'Você precisa estar logado para avaliar.');
    return res.redirect("/produto/" + productId);
  }

  try {
    const review = {
      productId: productId,
      userId: user.id,
      userName: user.name,
      rating: parseInt(rating),
      comment: comment,
      date: new Date().toISOString(),
    };

    await db.collection("reviews").add(review);

    // req.flash('success', 'Avaliação enviada com sucesso!');
    res.redirect("/produto/" + productId);
  } catch (error) {
    console.log(error);
    res.redirect("/produto/" + productId);
  }
};

// ==========================================
// 6. FILTROS E BUSCA
// ==========================================

// Filtrar por Categoria (COM FILTROS AVANÇADOS)
exports.getCategory = async (req, res) => {
  const categoryName = req.params.categoryName;

  // 1. Pega os filtros da URL (ex: ?ordem=menor&tamanho=M)
  const { ordem, tamanho } = req.query;

  try {
    const snapshot = await db
      .collection("products")
      .where("category", "==", categoryName)
      .get();

    let products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // 2. FILTRO DE TAMANHO (Javascript puro)
    if (tamanho) {
      // Só deixa passar produtos que tenham o tamanho escolhido na lista de sizes
      products = products.filter((p) => p.sizes && p.sizes.includes(tamanho));
    }

    // 3. ORDENAÇÃO DE PREÇO
    if (ordem === "menor") {
      products.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    } else if (ordem === "maior") {
      products.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    } else {
      // Padrão: Mais recentes primeiro (se tiver data)
      products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.render("shop/home", {
      pageTitle: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
      products: products,
      path: "/colecao",

      // 4. IMPORTANTE: Envia os filtros de volta para a tela
      // (para o select continuar marcado na opção certa)
      activeFilters: { ordem, tamanho },
    });
  } catch (error) {
    console.log("Erro na categoria:", error);
    res.redirect("/");
  }
};

// Buscar por Texto (Agora olha Título, Descrição, Categoria e Subcategoria)
exports.getSearch = async (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : "";

  try {
    const snapshot = await db.collection("products").get();
    const allProducts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const filteredProducts = allProducts.filter((p) => {
      // Verifica se a palavra buscada existe em algum desses lugares:
      const inTitle = p.title.toLowerCase().includes(query);
      const inDesc =
        p.description && p.description.toLowerCase().includes(query);
      const inCat = p.category && p.category.toLowerCase().includes(query);
      const inSub =
        p.subcategory && p.subcategory.toLowerCase().includes(query);

      // Se encontrar em QUALQUER um, retorna o produto
      return inTitle || inDesc || inCat || inSub;
    });

    res.render("shop/home", {
      pageTitle: `Busca: "${query}"`,
      products: filteredProducts,
      path: "/search",
    });
  } catch (error) {
    console.log(error);
    res.redirect("/");
  }
};

// ==========================================
// 7. CUPONS DE DESCONTO (LÓGICA)
// ==========================================

exports.postApplyCoupon = async (req, res) => {
  const code = req.body.couponCode ? req.body.couponCode.trim().toUpperCase() : "";
  const cart = req.session.cart;
  const user = req.session.user; // Pega o usuário da sessão

  if (!cart) return res.redirect("/carrinho");

  // --- TRAVA: Usuário precisa estar logado para usar cupom com limite ---
  if (!req.session.isLoggedIn || !user) {
    req.flash("error", "Você precisa estar logado para aplicar cupons.");
    return res.redirect("/login");
  }

  try {
    const doc = await db.collection("coupons").doc(code).get();

    if (!doc.exists) {
      req.flash("error", "Cupom inválido.");
      return res.redirect("/carrinho");
    }

    const couponData = doc.data();

    // 1. Verifica Validade (Data)
    const now = new Date();
    const expiresAt = new Date(couponData.expiresAt);
    if (now > expiresAt) {
      req.flash("error", `Este cupom venceu em ${expiresAt.toLocaleDateString("pt-BR")}.`);
      return res.redirect("/carrinho");
    }

    // --- 2. NOVA TRAVA: LIMITE POR USUÁRIO ---
    const usageLimit = couponData.usageLimit || 1; // Padrão é 1 se não definido

    // Busca pedidos do usuário que usaram este cupom e foram PAGOS ou estão em andamento
    const userOrders = await db.collection('orders')
        .where('user.id', '==', user.id)
        .where('couponUsed', '==', code)
        .where('status', 'in', ['Pago / Aprovado', 'Enviado', 'Aguardando Retirada'])
        .get();

    if (userOrders.size >= usageLimit) {
      req.flash("error", `Você já atingiu o limite de uso deste cupom (${usageLimit}x).`);
      return res.redirect("/carrinho");
    }
    // ------------------------------------------

    // 3. Aplica o Desconto
    const discountPercent = couponData.discount;
    const discountFactor = (100 - discountPercent) / 100;

    cart.coupon = {
      code: code,
      percent: discountPercent,
    };

    cart.totalWithDiscount = cart.totalPrice * discountFactor;

    req.session.save(() => {
      req.flash("success", `Cupom ${code} aplicado (-${discountPercent}%)!`);
      res.redirect("/carrinho");
    });

  } catch (error) {
    console.log("Erro ao aplicar cupom:", error);
    res.redirect("/carrinho");
  }
};

exports.postRemoveCoupon = (req, res) => {
  const cart = req.session.cart;
  if (cart) {
    delete cart.coupon;
    delete cart.totalWithDiscount;
  }
  req.session.save(() => {
    req.flash("success", "Cupom removido.");
    res.redirect("/carrinho");
  });
};

// --- CÁLCULO DE FRETE (API) ---
exports.postCalculateShipping = async (req, res) => {
  // PEGA A VARIÁVEL NOVA 'isCheckout'
  const { cep, productId, isCheckout } = req.body;

  try {
    let produtosParaCalculo = [];

    if (productId) {
      const doc = await db.collection("products").doc(productId).get();
      if (doc.exists) {
        const prod = doc.data();
        prod.id = doc.id;
        produtosParaCalculo.push(prod);
      }
    } else if (req.session.cart && req.session.cart.items.length > 0) {
      produtosParaCalculo = req.session.cart.items.map((item) => ({
        id: item.productId,
        price: item.price,
        width: 20,
        height: 5,
        length: 20,
        weight: 0.3,
        quantity: item.qty,
      }));
    }

    if (produtosParaCalculo.length === 0)
      return res.status(400).json({ error: "Erro" });

    // Passamos o 'isCheckout' para o serviço decidir se mostra "Retirar"
    const opcoesFrete = await shippingService.calcularFrete(
      cep,
      produtosParaCalculo,
      isCheckout
    );

    res.json(opcoesFrete);
  } catch (error) {
    console.log("Erro Frete:", error.message);
    res.status(500).json({ error: "Erro ao calcular" });
  }
};

// ==========================================
// 8. PÁGINA DE LANÇAMENTOS (ÚLTIMOS 7 DIAS)
// ==========================================

exports.getNewArrivals = async (req, res) => {
  try {
    // 1. Calcula a data de 7 dias atrás
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 7); // Hoje menos 7 dias

    // 2. Busca todos os produtos
    // (Fazemos o filtro no JavaScript para evitar erros de índice no Firebase)
    const snapshot = await db.collection("products").get();
    const allProducts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 3. Filtra: Só passa quem tem data de criação maior que a data limite
    const newProducts = allProducts.filter((p) => {
      if (!p.createdAt) return false; // Se for produto antigo sem data, ignora
      const productDate = new Date(p.createdAt);
      return productDate >= dateLimit;
    });

    // Ordena do mais recente para o mais antigo
    newProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 4. Renderiza usando o visual da Home
    res.render("shop/home", {
      pageTitle: "Lançamentos da Semana",
      products: newProducts,
      path: "/colecao/lancamentos", // Para o menu saber onde estamos
    });
  } catch (error) {
    console.log("Erro Lançamentos:", error);
    res.redirect("/");
  }
};

// ==========================================
// 9. PÁGINA DE PROMOÇÕES
// ==========================================

exports.getPromotions = async (req, res) => {
  try {
    const snapshot = await db.collection("products").get();
    const allProducts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filtra apenas produtos que têm preço promocional válido
    // E o preço promo tem que ser menor que o original (senão não é promoção!)
    const promoProducts = allProducts.filter((p) => {
      const promo = parseFloat(p.promoPrice);
      const original = parseFloat(p.originalPrice);
      return promo > 0 && promo < original;
    });

    res.render("shop/home", {
      pageTitle: "Ofertas Imperdíveis", // Título que vai aparecer na página
      products: promoProducts,
      path: "/colecao/promocao",
    });
  } catch (error) {
    console.log("Erro Promoções:", error);
    res.redirect("/");
  }
};

// ==========================================
// 10. PÁGINAS INSTITUCIONAIS (ATUALIZADO)
// ==========================================

exports.getInstitucional = (req, res) => {
  const page = req.params.page; // Pega o nome da página da URL

  let title = "";
  let content = "";

  // Define o conteúdo baseado no link
  switch (page) {
    // --- AQUI ESTÁ O QUE FALTAVA ---
    case "quem-somos":
      title = "Sobre a Marca";
      content = `
                <div class="brand-story">
                    <p>A <strong>MC</strong> nasceu há 3 anos com o propósito de criar moda que una <span style="color:#c4a47c; font-weight:bold;">elegância, conforto e versatilidade</span>.</p>
                    
                    <p>Desde o início, nossa marca é guiada pelo cuidado em cada detalhe, desenvolvendo peças que valorizam a mulher moderna e acompanham sua rotina com leveza e estilo.</p>

                    <hr style="border:0; height:1px; background:#eee; margin:30px auto; width:50%;">

                    <p>Acreditamos que vestir-se bem vai além da estética: é sobre sentir-se confiante, confortável e autêntica em todos os momentos.</p>
                    
                    <p>Por isso, todos os nossos lançamentos são pensados para oferecer modelagens confortáveis, tecidos de qualidade e um design atemporal, permitindo combinações práticas e sofisticadas para diferentes ocasiões.</p>

                    <div style="margin-top:40px; padding:20px; background:#f9f9f9; border-left:4px solid #c4a47c; font-style:italic; text-align:center; border-radius: 4px;">
                        "Na MC, cada peça é criada para fazer parte da sua história, trazendo beleza, praticidade e personalidade para o seu dia a dia."
                    </div>
                </div>
            `;
      break;

    case "trocas":
      title = "Trocas e Devoluções";
      content = `
                <h3>Política de Troca</h3>
                <p>Aqui na Maely Cristina, queremos que você ame sua peça! <br> Se precisar trocar, você tem até <strong>7 dias corridos</strong> após o recebimento.</p>
                
            `;
      break;

    case "entrega":
      title = "Política de Entrega";
      content =
        "<p>Enviamos para todo o Brasil via Loggi, Correios e Transportadoras. <br> O prazo começa a contar após a confirmação do pagamento.</p>";
      break;

    case "contato":
      title = "Fale Conosco";
      content =
        "<p>WhatsApp: <strong>(41) 99681-3385</strong> <br> E-mail: mc.maelycristina@hotmail.com</p>";
      break;

    default:
      // Se a página não existir, volta para a home
      return res.redirect("/");
  }

  res.render("shop/text-page", {
    pageTitle: title,
    path: "/institucional",
    title: title,
    content: content,
  });
};

// ==========================================
// 11. ÁREA DE FAVORITOS
// ==========================================

// 1. Renderiza a página (o esqueleto)
exports.getFavoritesPage = (req, res) => {
  res.render("shop/favorites", {
    pageTitle: "Meus Favoritos",
    path: "/favoritos",
  });
};

// 2. API: Recebe uma lista de IDs e devolve os dados dos produtos
exports.postGetFavoriteProducts = async (req, res) => {
  const ids = req.body.ids || [];

  if (ids.length === 0) {
    return res.json([]);
  }

  try {
    // O Firestore tem um limite para buscar vários IDs ("IN" query).
    // Se tiver muitos favoritos, pegamos os 10 primeiros por segurança.
    const safeIds = ids.slice(0, 10);

    const snapshot = await db
      .collection("products")
      .where(admin.firestore.FieldPath.documentId(), "in", safeIds)
      .get();

    const products = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(products);
  } catch (error) {
    console.log("Erro ao buscar favoritos:", error);
    res.status(500).json({ error: "Erro ao buscar favoritos" });
  }
};

// ==========================================
// 12. SINCRONIZAÇÃO DE FAVORITOS (BANCO DE DADOS)
// ==========================================

// Salvar/Remover Favorito no Firebase
exports.postToggleFavoriteAPI = async (req, res) => {
  if (!req.session.isLoggedIn) return res.json({ status: "ignored" }); // Se não tá logado, só salva local

  const userId = req.session.user.id;
  const prodId = req.body.productId;

  try {
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();
    let favs = doc.data().favorites || [];

    if (favs.includes(prodId)) {
      // Remove
      await userRef.update({
        favorites: admin.firestore.FieldValue.arrayRemove(prodId),
      });
      res.json({ status: "removed" });
    } else {
      // Adiciona
      await userRef.update({
        favorites: admin.firestore.FieldValue.arrayUnion(prodId),
      });
      res.json({ status: "added" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao salvar favorito" });
  }
};

// Ler Favoritos do Usuário (Para restaurar ao logar)
exports.getUserFavoritesAPI = async (req, res) => {
  if (!req.session.isLoggedIn) return res.json([]);

  try {
    const doc = await db.collection("users").doc(req.session.user.id).get();
    const favs = doc.data().favorites || [];
    res.json(favs);
  } catch (error) {
    console.error(error);
    res.json([]);
  }
};

// ==========================================
// 13. PAGAMENTO TARDIO (RE-PAGAR)
// ==========================================

// Tela de escolher pagamento novamente
exports.getPayOrder = async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const doc = await db.collection("orders").doc(orderId).get();
    if (!doc.exists) return res.redirect("/pedidos");

    const order = doc.data();
    order.id = doc.id;

    // Segurança: Só o dono do pedido pode pagar
    if (!req.session.user || order.user.id !== req.session.user.id) {
      return res.redirect("/pedidos");
    }

    // --- LÓGICA PARA EVITAR O DESCONTO DUPLICADO ---
    // Pegamos o valor que salvamos como 'baseProdutos' (valor das peças com cupom mas SEM PIX).
    // Caso o pedido seja antigo e não tenha esse campo, usamos o 'subtotal' como reserva.
    const valorBaseDasPecas = order.baseProdutos || order.subtotal;

    res.render("shop/payment", {
      pageTitle: "Realizar Pagamento",
      order: order,
      valorPeçasSemPix: valorBaseDasPecas, // Enviamos este valor "limpo" para a página
      path: '/pedidos'
    });
  } catch (error) {
    console.log("Erro ao carregar página de pagamento:", error);
    res.redirect("/pedidos");
  }
};

// Processar o novo pagamento (CORRIGIDO)
exports.postPayOrder = async (req, res) => {
    const orderId = req.params.orderId;
    const paymentMethod = req.body.paymentMethod; // 'pix' ou 'credit_card'

    try {
        const orderRef = db.collection("orders").doc(orderId);
        const doc = await orderRef.get();
        if (!doc.exists) return res.redirect("/pedidos");

        const order = doc.data();
        const user = req.session.user;
        const cpf = req.body.cpf || user.cpf || order.user.cpf;

        // --- LÓGICA DE DESCONTO PIX (5% sobre os produtos) ---
        // --- NOVA LÓGICA DE CÁLCULO (RECUPERA VALOR CHEIO) ---
// 1. Pegamos o valor das peças sem o desconto do PIX anterior.
// Priorizamos 'baseProdutos' (que já tem cupom), se não tiver usamos o 'subtotal'.
const valorProdutosSemPix = order.baseProdutos || order.subtotal;
const valorFrete = order.shippingCost || 0;

let valorFinalRecalculado;

if (paymentMethod === 'pix') {
    // Se escolheu PIX: Aplica o desconto de 5% sobre o valor base das peças
    const descontoPix = valorProdutosSemPix * 0.05;
    valorFinalRecalculado = (valorProdutosSemPix - descontoPix) + valorFrete;
    console.log("Re-pagamento PIX: Aplicando 5% de desconto.");
} else {
    // Se escolheu Cartão: Cobra o valor cheio das peças + frete
    valorFinalRecalculado = valorProdutosSemPix + valorFrete;
    console.log("Re-pagamento Cartão: Cobrando valor integral.");
}
        const valorFinalFormatado = parseFloat(valorFinalRecalculado.toFixed(2));

        // --- INTEGRAÇÃO MERCADO PAGO ---
        if (paymentMethod === "pix") {
            const pixData = await paymentService.gerarPixMercadoPago(
                { id: orderId, totalPrice: valorFinalFormatado },
                user,
                cpf
            );
            
            // Certifique-se de ter o QRCode importado no topo do seu arquivo
            const qrCodeImage = await QRCode.toDataURL(pixData.qrCodeText);

            await orderRef.update({
                pixCode: pixData.qrCodeText,
                mercadoPagoId: pixData.id,
                status: "Aguardando Pagamento",
                paymentMethod: "PIX (Re-tentativa)"
            });

            return res.render('shop/success-pix', {
                pageTitle: 'Pagar com PIX',
                path: '',
                qrCodeImage,
                pixCode: pixData.qrCodeText,
                total: valorFinalFormatado
            });

        } else {
            // CARTÃO MERCADO PAGO
            const cardToken = req.body.cardToken;
            const installments = req.body.installments;
            const paymentMethodId = req.body.paymentMethodId;

            const cardResult = await paymentService.processarCartaoMercadoPago(
                { id: orderId, totalPrice: valorFinalFormatado },
                user,
                cpf,
                cardToken,
                installments,
                paymentMethodId
            );

            if (cardResult.status === 'Pago / Aprovado') {
        // --- ADICIONE ESTA LÓGICA DE NOME ---
        const tipoCartao = req.body.cardType === 'debit' ? "Cartão de Débito" : "Cartão de Crédito";
        
        await orderRef.update({ 
            status: 'Pago / Aprovado', 
            mercadoPagoId: cardResult.id,
            // Salva o nome correto (Ex: Cartão de Débito (Re-tentativa))
            paymentMethod: tipoCartao + " (Re-tentativa)" 
        });
        
        return res.render('shop/success', { pageTitle: 'Pagamento Aprovado', path: '' });
      
            } else {
                req.flash('error', 'Pagamento recusado: ' + (cardResult.message || 'Verifique os dados'));
                return res.redirect("/pagar-pedido/" + orderId);
            }
        }
    } catch (error) {
        console.error("ERRO REPAGAMENTO:", error);
        req.flash("error", "Erro ao processar pagamento.");
        res.redirect("/pagar-pedido/" + orderId);
    }
};

exports.getPagSeguroKey = async (req, res) => {
  try {
    const key = await paymentService.getPublicKey();
    res.json({ key: key });
  } catch (e) {
    res.status(500).json({ error: "Erro chave" });
  }
};

// ==========================================
// 14. CONTROLE DE QUANTIDADE (+/-)
// ==========================================

// AUMENTAR QUANTIDADE (COM VERIFICAÇÃO DE ESTOQUE)
exports.postCartIncrease = async (req, res) => {
  const { productId, size, color } = req.body;
  const cart = req.session.cart;
  if (!cart) return res.redirect("/carrinho");

  try {
    const doc = await db.collection("products").doc(productId).get();
    if (!doc.exists) return res.redirect("/carrinho");

    const product = doc.data();
    // BUSCA A VARIAÇÃO ESPECÍFICA
    const variacao = product.variations ? product.variations.find(v => v.color === color && v.size === size) : null;
    const realStock = variacao ? parseInt(variacao.stock) : 0;

    const itemIndex = cart.items.findIndex(
      (i) =>
        i.productId === productId &&
        i.size === size &&
        (i.color || "") === color
    );

    if (itemIndex >= 0) {
      // 2. Verifica se pode aumentar baseando-se na variação
      if (cart.items[itemIndex].qty + 1 > realStock) {
        req.flash(
          "error",
          `Estoque insuficiente para o tamanho ${size}. Máximo disponível: ${realStock}`
        );
        return res.redirect("/carrinho");
      }

      // Se passou, aumenta
      cart.items[itemIndex].qty += 1;
      cart.totalQty += 1;
      cart.totalPrice += parseFloat(cart.items[itemIndex].price);

      if (cart.coupon) {
        const factor = (100 - cart.coupon.percent) / 100;
        cart.totalWithDiscount = cart.totalPrice * factor;
      }

      if (req.session.user) {
        await db
          .collection("users")
          .doc(req.session.user.id)
          .update({ cart: cart })
          .catch(() => {});
      }
    }

    req.session.save(() => res.redirect("/carrinho"));
  } catch (error) {
    console.log(error);
    res.redirect("/carrinho");
  }
};

// DIMINUIR QUANTIDADE
exports.postCartDecrease = async (req, res) => {
  const { productId, size, color } = req.body;
  const cart = req.session.cart;
  if (!cart) return res.redirect("/carrinho");

  const itemIndex = cart.items.findIndex(
    (i) =>
      i.productId === productId && i.size === size && (i.color || "") === color
  );

  if (itemIndex >= 0) {
    const item = cart.items[itemIndex];

    if (item.qty > 1) {
      item.qty -= 1;
      cart.totalQty -= 1;
      cart.totalPrice -= parseFloat(item.price);
    } else {
      // Se for 1 e diminuir, remove o item?
      // Geralmente sim, ou bloqueia. Vamos remover:
      cart.totalQty -= 1;
      cart.totalPrice -= parseFloat(item.price);
      cart.items.splice(itemIndex, 1);
    }

    // Recalcula cupom
    if (cart.coupon) {
      const factor = (100 - cart.coupon.percent) / 100;
      cart.totalWithDiscount = cart.totalPrice * factor;
    }

    await salvarCarrinhoNoBanco(req, cart);
  }

  req.session.save(() => res.redirect("/carrinho"));
};

// Pequena função auxiliar para não repetir código de banco
async function salvarCarrinhoNoBanco(req, cart) {
  if (req.session.user) {
    await db
      .collection("users")
      .doc(req.session.user.id)
      .update({ cart: cart })
      .catch(() => {});
  }
}

// Filtrar por Categoria + Subcategoria
exports.getSubCategory = async (req, res) => {
  const { categoryName, subcategoryName } = req.params; // Pega da URL

  try {
    const snapshot = await db
      .collection("products")
      .where("category", "==", categoryName) // Primeiro filtro
      .get();

    const allProducts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Segundo filtro (no JavaScript): Pega a subcategoria exata (ignorando maiúsculas/minúsculas)
    const products = allProducts.filter(
      (p) =>
        p.subcategory &&
        p.subcategory.toLowerCase().trim() ===
          subcategoryName.toLowerCase().trim()
    );

    res.render("shop/home", {
      pageTitle: `${subcategoryName} em ${categoryName}`,
      products: products,
      path: "/colecao",
    });
  } catch (error) {
    console.log(error);
    res.redirect("/colecao/" + categoryName);
  }
};



exports.mercadoPagoWebhook = async (req, res) => {
    // Pegamos o ID do pagamento enviado pelo Mercado Pago
    const paymentId = req.query.id || (req.body.data && req.body.data.id);

    try {
        if (paymentId) {
            // 1. Consultamos o Mercado Pago para saber o status real
            const response = await payment.get({ id: paymentId });
            const status = response.status;
            const orderId = response.external_reference; // O ID do pedido que enviamos

            const orderRef = db.collection('orders').doc(orderId);
            const orderDoc = await orderRef.get();

            if (orderDoc.exists) {
                const orderData = orderDoc.data();

                // SE FOI APROVADO: Muda o status para Pago
                if (status === 'approved' && orderData.status !== 'Pago / Aprovado') {
                    await orderRef.update({ status: 'Pago / Aprovado', mercadoPagoId: paymentId.toString() });
                    console.log(`Webhook: Pedido ${orderId} aprovado.`);
                }

                // SE FOI CANCELADO OU EXPIROU: Devolve o estoque
                if ((status === 'cancelled' || status === 'expired') && orderData.status === 'Aguardando Pagamento') {
                    if (!orderData.estoqueDevolvido) {
                        await estornarEstoque(orderData.items); // Chama a função que vamos criar abaixo
                        await orderRef.update({ status: 'Cancelado / Expirado', estoqueDevolvido: true });
                        console.log(`Webhook: Estoque do pedido ${orderId} devolvido.`);
                    }
                }
            }
        }
        res.sendStatus(200); // Responde OK para o Mercado Pago
    } catch (error) {
        console.error("Erro no Webhook:", error);
        res.sendStatus(500);
    }
};

// ✅ ADICIONE ISSO NO FINAL DO ARQUIVO (FORA DE TUDO)
async function baixarEstoqueDasVariacoes(items) {
    for (const item of items) {
        try {
            const prodRef = db.collection("products").doc(item.productId);
            const pDoc = await prodRef.get();
            if (pDoc.exists) {
                const productData = pDoc.data();
                let variations = productData.variations || [];
                let globalStock = parseInt(productData.stock || 0);
                const varIndex = variations.findIndex(v => v.color === item.color && v.size === item.size);
                if (varIndex > -1) {
                    variations[varIndex].stock = Math.max(0, parseInt(variations[varIndex].stock) - item.qty);
                    globalStock = Math.max(0, globalStock - item.qty);
                    await prodRef.update({ variations, stock: globalStock });
                }
            }
        } catch (err) { console.error("Erro estoque:", err); }
    }
};

// --- FUNÇÃO AUXILIAR PARA DEVOLVER ESTOQUE (SOMA AO INVÉS DE SUBTRAIR) ---
async function estornarEstoque(items) {
    for (const item of items) {
        try {
            const prodRef = db.collection('products').doc(item.productId);
            const pDoc = await prodRef.get();
            if (pDoc.exists) {
                const productData = pDoc.data();
                let variations = productData.variations || [];
                let globalStock = parseInt(productData.stock || 0);

                const varIndex = variations.findIndex(v => v.color === item.color && v.size === item.size);
                if (varIndex > -1) {
                    // SOMA as quantidades de volta
                    variations[varIndex].stock = parseInt(variations[varIndex].stock) + item.qty;
                    globalStock = globalStock + item.qty;
                    await prodRef.update({ variations, stock: globalStock });
                }
            }
        } catch (err) { console.error("Erro ao estornar estoque:", err); }
    }
};