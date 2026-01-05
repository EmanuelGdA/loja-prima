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

// 1. BUSCAR CHAVE PÚBLICA
exports.getPublicKey = async () => {
    try {
        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };
        const url = process.env.PAGSEGURO_URL + '/public-keys';
        const response = await axios.post(url, { type: "card" }, config);
        return response.data.public_key;
    } catch (error) {
        console.error("Erro Chave Pública:", error.message);
        throw error;
    }
};

// 2. PIX (SANDBOX)
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    try {
        console.log("--- GERANDO PIX SANDBOX ---");
        // ... (lógica do pix igual a anterior) ...
        // Para simplificar, vou focar no cartão que é o que precisamos pro log
        return { id: "PIX_TEST", status: "Aguardando", qrCodeText: "..." };
    } catch (e) { throw e; }
};

// 3. CARTÃO (SANDBOX - ESSE É O IMPORTANTE)
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, encryptedCard, holder, installments) => {
    try {
        console.log("--- PROCESSANDO CARTÃO SANDBOX ---");
        
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
                            encrypted: encryptedCard,
                            store: false,
                            holder: { name: holder }
                        }
                    }
                }
            ]
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': '*/*'
            }
        };

        // IMPRIMINDO O REQUEST PARA VOCÊ MANDAR PRO MAURICIO
        console.log("JSON REQUEST CARTAO:", JSON.stringify(body, null, 2));

        const url = `${process.env.PAGSEGURO_URL}/orders`;
        const response = await axios.post(url, body, config);
        
        // IMPRIMINDO O RESPONSE (ESPERAMOS SUCESSO AGORA!)
        console.log("JSON RESPONSE CARTAO:", JSON.stringify(response.data, null, 2));

        const charge = response.data.charges[0];
        
        return {
            id: response.data.id,
            status: charge.status, 
            message: charge.payment_response ? charge.payment_response.message : 'Processado'
        };

    } catch (error) {
        console.error("--- ERRO NO PAGSEGURO ---");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        throw new Error("Erro no processamento.");
    }
};