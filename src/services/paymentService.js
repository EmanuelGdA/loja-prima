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

// 1. PIX (Modo Real com Logs - Mantive aqui caso precise)
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    // ... (mesmo código do pix anterior, mas vamos focar no cartão agora) ...
    // Se quiser, pode manter a versão simplificada de simulação aqui se não for testar pix agora
    // Vou colocar a versão real curta:
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

// 2. CARTÃO DE CRÉDITO (AQUI É O FOCO!)
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, cartao) => {
    try {
        console.log("--- INICIANDO CARTÃO (LOG PARA HOMOLOGAÇÃO) ---");
        
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        const [mes, ano] = cartao.expiration.split('/');

        // Payload do Cartão (Estrutura V4)
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
                        installments: parseInt(cartao.installments),
                        capture: true, // Cobrar na hora
                        card: {
                            number: cartao.number.replace(/\s/g, ''),
                            exp_month: mes,
                            exp_year: "20" + ano,
                            security_code: cartao.cvv,
                            holder: { name: cartao.holder }
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

        // IMPRIMINDO O REQUEST PARA VOCÊ COPIAR
        console.log("JSON REQUEST CARTAO:", JSON.stringify(body, null, 2));

        // URL (Usa Sandbox por enquanto)
        const url = process.env.PAGSEGURO_URL || 'https://sandbox.api.pagseguro.com';
        const response = await axios.post(`${url}/orders`, body, config);
        
        // IMPRIMINDO O RESPONSE
        console.log("JSON RESPONSE CARTAO:", JSON.stringify(response.data, null, 2));

        const charge = response.data.charges[0];
        
        return {
            id: response.data.id,
            status: charge.status, 
            message: charge.payment_response ? charge.payment_response.message : 'Processado'
        };

    } catch (error) {
        console.error("--- ERRO PAGSEGURO CARTÃO ---");
        if (error.response) {
            // Se der erro, imprimimos o erro também (eles aceitam log de erro de whitelist)
            console.error("JSON RESPONSE ERRO:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        throw new Error("Erro no processamento do cartão.");
    }
};