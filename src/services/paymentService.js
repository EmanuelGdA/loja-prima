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

// 1. BUSCAR CHAVE PÚBLICA (ESSENCIAL PARA CRIPTOGRAFIA)
exports.getPublicKey = async () => {
    try {
        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };
        // Garante que pega a chave do ambiente configurado no .env
        const url = (process.env.PAGSEGURO_URL || 'https://sandbox.api.pagseguro.com') + '/public-keys';
        
        console.log("Buscou chave em:", url);
        const response = await axios.post(url, { type: "card" }, config);
        return response.data.public_key;
    } catch (error) {
        console.error("Erro Chave Pública:", error.message);
        throw error;
    }
};

// 2. PIX (REAL)
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    // ... (mesmo código de antes para Pix, se quiser pode manter o simulado aqui, mas foque no cartão)
    // Para simplificar esse arquivo pro teste do cartão, vou deixar o Pix simulado aqui pra não atrapalhar
    return { id: "PIX_TESTE", status: "Aguardando", qrCodeText: "..." };
};

// 3. CARTÃO (COM CRIPTOGRAFIA)
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, encryptedCard, holder, installments) => {
    try {
        console.log("--- INICIANDO CARTÃO CRIPTOGRAFADO ---");
        
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
                            encrypted: encryptedCard, // O HASH QUE O FRONTEND MANDOU
                            store: false, 
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

        console.log("JSON REQUEST CARTAO:", JSON.stringify(body, null, 2));

        const url = (process.env.PAGSEGURO_URL || 'https://sandbox.api.pagseguro.com') + '/orders';
        const response = await axios.post(url, body, config);
        
        console.log("JSON RESPONSE CARTAO (SUCESSO):", JSON.stringify(response.data, null, 2));

        const charge = response.data.charges[0];
        
        return {
            id: response.data.id,
            status: charge.status, 
            message: charge.payment_response ? charge.payment_response.message : 'Processado'
        };

    } catch (error) {
        console.error("--- ERRO RESPOSTA PAGSEGURO ---");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        throw new Error("Erro no cartão.");
    }
};