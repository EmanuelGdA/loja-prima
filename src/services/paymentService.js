const axios = require('axios');

const buildCustomer = (cliente, cpf) => {
    const cleanCPF = cpf ? cpf.replace(/\D/g, '') : '';
    return {
        name: cliente.name,
        email: cliente.email,
        tax_id: cleanCPF,
        phones: [{ country: "55", area: "11", number: "999999999", type: "MOBILE" }]
    };
};

// --- NOVO: BUSCAR CHAVE PÚBLICA PARA CRIPTOGRAFIA ---
exports.getPublicKey = async () => {
    try {
        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            }
        };

        const url = (process.env.PAGSEGURO_URL || 'https://sandbox.api.pagseguro.com') + '/public-keys';
        
        // Cria uma chave nova
        const response = await axios.post(url, { type: "card" }, config);
        
        return response.data.public_key;

    } catch (error) {
        console.error("Erro ao pegar Chave Pública:", error.response?.data || error.message);
        throw new Error("Falha na segurança do pagamento.");
    }
};

// 1. PIX (Modo Real com Logs - Mantive aqui caso precise)
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    
    try {
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        const body = {
            reference_id: pedido.id,
            customer: buildCustomer(cliente, cpf),
            items: [{ reference_id: "1", name: "Pedido Loja", quantity: 1, unit_amount: valorEmCentavos }],
            qr_codes: [{ amount: { value: valorEmCentavos }, kind: "CALENDAR" }],
            notification_urls: ["https://loja-prima.onrender.com/api/webhook/pagseguro"]
        };
        const config = { headers: { 'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`, 'Content-Type': 'application/json', 'accept': '*/*' }};
        const url = process.env.PAGSEGURO_URL || 'https://sandbox.api.pagseguro.com';
        const response = await axios.post(`${url}/orders`, body, config);
        return { id: response.data.id, status: 'Aguardando Pagamento', qrCodeText: response.data.qr_codes[0].text };
    } catch (e) { throw new Error("Erro Pix"); }
};

// 2. CARTÃO DE CRÉDITO (VERSÃO SEGURA - CRIPTOGRAFADA)
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, encryptedCard, holder, installments) => {
    try {
        console.log("--- INICIANDO CARTÃO SEGURO ---");
        
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);

        const body = {
            reference_id: pedido.id,
            customer: buildCustomer(cliente, cpf),
            items: [{ reference_id: "1", name: "Pedido Loja Maely", quantity: 1, unit_amount: valorEmCentavos }],
            charges: [
                {
                    reference_id: pedido.id,
                    description: "Compra Loja Maely",
                    amount: { value: valorEmCentavos, currency: "BRL" },
                    payment_method: {
                        type: "CREDIT_CARD",
                        installments: parseInt(installments),
                        capture: true,
                        card: {
                            // AQUI ESTÁ A MUDANÇA: Não enviamos number/cvv/mes/ano. Enviamos só isso:
                            encrypted: encryptedCard, 
                            store: true, // Opcional, pede para salvar se possível
                            holder: { name: holder }
                        }
                    }
                }
            ],
            notification_urls: ["https://loja-prima.onrender.com/api/webhook/pagseguro"]
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': '*/*'
            }
        };

        console.log("JSON REQUEST (ENCRYPTED):", JSON.stringify(body, null, 2));

        const url = (process.env.PAGSEGURO_URL || 'https://sandbox.api.pagseguro.com') + '/orders';
        const response = await axios.post(url, body, config);
        
        console.log("JSON RESPONSE:", JSON.stringify(response.data, null, 2));

        const charge = response.data.charges[0];
        
        return {
            id: response.data.id,
            status: charge.status, 
            message: charge.payment_response ? charge.payment_response.message : 'Processado'
        };

    } catch (error) {
        console.error("--- ERRO CARTÃO ---");
        if(error.response) console.error(JSON.stringify(error.response.data, null, 2));
        throw new Error("Erro no processamento do cartão.");
    }
};