require('dotenv').config();
const axios = require('axios');

exports.calcularFrete = async (cepDestino, produtos, isCheckout = false) => {
     try {
        const cleanCep = cepDestino.replace(/\D/g, '');
        const prefix = cleanCep.substring(0, 2);

        // --- 1. CÁLCULO DO TOTAL DO CARRINHO (CÓDIGO NOVO) ---
        // Somamos (Preço x Quantidade) de todos os itens recebidos
        const totalCartValue = produtos.reduce((sum, p) => {
            // Tenta pegar o preço em 'price' ou 'insurance_value', garante que é número
            const price = parseFloat(p.price || p.insurance_value || 0);
            const qty = parseInt(p.quantity || p.qty || 1);
            return sum + (price * qty);
        }, 0);

         const isFreeShipping = totalCartValue >= 499.00;

        // Define o preço do Motoboy com base no total
        // Se for maior ou igual a 499, é 0.00. Senão, é 15.00.
        const precoMotoboy = totalCartValue >= 499.00 ? 0.00 : 15.00;
        
        // Muda o nome para avisar o cliente
        const nomeMotoboy = totalCartValue >= 499.00 ? 'Entrega Motoboy (FRETE GRÁTIS!)' : 'Entrega Motoboy';

        // ==============================================================
        // CENÁRIO 1: CURITIBA (80, 81, 82)
        // ==============================================================
        if (prefix === '80' || prefix === '81' || prefix === '82') {
            console.log(`Frete Local. Total Carrinho: R$ ${totalCartValue.toFixed(2)}`);
            
            const opcoesLocais = [];

            // Se NÃO for checkout (está na página do produto), mostra a opção de retirar
            if (!isCheckout) {
                opcoesLocais.push({
                    id: 'local_retirada',
                    nome: 'Retirar na Loja',
                    preco: 0.00,
                    prazo: '0',
                    logo: null 
                });
            }

            // Opção de Motoboy (AGORA É DINÂMICA)
            opcoesLocais.push({
                id: 'local_motoboy',
                nome: nomeMotoboy,   // Usa o nome variável
                preco: precoMotoboy, // Usa o preço calculado (0 ou 15)
                prazo: '1',
                logo: null 
            });

            return opcoesLocais;
        }

        // ==============================================================
        // CENÁRIO 2: NACIONAL (MELHOR ENVIO)
        // ==============================================================
        const token = process.env.MELHOR_ENVIO_TOKEN;
        const url = process.env.MELHOR_ENVIO_URL;
        const cepOrigem = process.env.CEP_ORIGEM;

        if (!cepOrigem || !token) throw new Error("Configuração incompleta.");

        const produtosFormatados = produtos.map(prod => ({
            id: prod.id,
            width: parseInt(prod.width) || 20,
            height: parseInt(prod.height) || 5,
            length: parseInt(prod.length) || 20,
            weight: parseFloat(prod.weight) || 0.3,
            insurance_value: parseFloat(prod.price) || 10.00,
            quantity: 1
        }));

        const body = {
            from: { postal_code: cepOrigem },
            to: { postal_code: cleanCep },
            products: produtosFormatados,
            options: { receipt: false, own_hand: false }
        };

        const config = { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' } };

        const response = await axios.post(`${url}/me/shipment/calculate`, body, config);

    

        // --- 2. FILTRAR AS MELHORES OPÇÕES ---
        let bestLoggi = null;
        let bestSedex = null;
        let bestPac = null;

        response.data.forEach(op => {
            if (op.error) return;
            const name = (op.company.name + " " + op.name).toLowerCase();
            const price = parseFloat(op.price);

            // Loggi
            if (name.includes('loggi')) {
                if (!bestLoggi || price < parseFloat(bestLoggi.price)) {
                    bestLoggi = op;
                    bestLoggi.customName = 'Loggi Express';
                }
            } 
            // Sedex
            else if (name.includes('sedex')) {
                if (!bestSedex || price < parseFloat(bestSedex.price)) {
                    bestSedex = op;
                    bestSedex.customName = 'Correios SEDEX';
                }
            } 
            // PAC
            else if (name.includes('pac')) {
                if (!bestPac || price < parseFloat(bestPac.price)) {
                    bestPac = op;
                    bestPac.customName = 'Correios PAC';
                }
            }
        });

        // --- 3. APLICAR FRETE GRÁTIS ---
        // Regra: Se > 499, Loggi e PAC ficam gratuitos. Sedex continua pago (opção expressa).
        // Se preferir Sedex grátis também, adicione a linha do Sedex dentro do if.
        
        if (isFreeShipping) {
            if (bestLoggi) {
                bestLoggi.price = 0; 
                bestLoggi.customName += ' (FRETE GRÁTIS)';
            }
            if (bestPac) {
                bestPac.price = 0;
                bestPac.customName += ' (FRETE GRÁTIS)';
            }
        }

        // --- 4. RETORNAR SÓ O NECESSÁRIO ---
        // A sua regra: Se tem Loggi, manda só Loggi. Se não tem, manda Correios.
        
        let finalOptions = [];

        if (bestLoggi) {
            finalOptions = [bestLoggi];
        } else {
            // Se não tem Loggi, manda o que tiver de Correios
            if (bestSedex) finalOptions.push(bestSedex);
            if (bestPac) finalOptions.push(bestPac);
        }

        // Formata para o padrão do nosso site
        return finalOptions.map(op => ({
            id: op.id,
            nome: op.customName,
            logo: op.company.picture,
            preco: parseFloat(op.price),
            prazo: op.delivery_time
        })).sort((a, b) => a.preco - b.preco);

    } catch (error) {
        console.error("Erro Frete:", error.message);
        throw new Error("Não foi possível calcular o frete.");
    }
};