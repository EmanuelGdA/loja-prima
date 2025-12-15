const axios = require('axios');

// Função Auxiliar para montar o cliente
const buildCustomer = (cliente, cpf) => {
    return {
        name: cliente.name,
        email: cliente.email,
        tax_id: cpf.replace(/\D/g, ''),
        phones: [{ country: "55", area: "11", number: "999999999", type: "MOBILE" }]
    };
};

// 1. PIX
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    try {
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        
        const body = {
            reference_id: pedido.id,
            customer: buildCustomer(cliente, cpf),
            items: [{ reference_id: "1", name: "Pedido Loja", quantity: 1, unit_amount: valorEmCentavos }],
            qr_codes: [{ amount: { value: valorEmCentavos }, kind: "CALENDAR" }]
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.post(`${process.env.PAGSEGURO_URL}/orders`, body, config);
        return {
            id: response.data.id,
            status: 'Aguardando Pagamento',
            qrCodeText: response.data.qr_codes[0].text
        };

    } catch (error) {
        console.error("ERRO PIX PAGSEGURO:", error.response?.data || error.message);
        throw new Error("Erro ao gerar PIX.");
    }
};

// 2. CARTÃO DE CRÉDITO
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, cartao) => {
    try {
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        const [mes, ano] = cartao.expiration.split('/');

        const body = {
            reference_id: pedido.id,
            customer: buildCustomer(cliente, cpf),
            items: [{ reference_id: "1", name: "Pedido Loja", quantity: 1, unit_amount: valorEmCentavos }],
            charges: [
                {
                    reference_id: pedido.id,
                    description: "Compra Loja da Prima",
                    amount: { value: valorEmCentavos, currency: "BRL" },
                    payment_method: {
                        type: "CREDIT_CARD",
                        installments: parseInt(cartao.installments),
                        capture: true,
                        card: {
                            number: cartao.number.replace(/\s/g, ''),
                            exp_month: mes,
                            exp_year: "20" + ano,
                            security_code: cartao.cvv,
                            holder: { name: cartao.holder }
                        }
                    }
                }
            ]
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.post(`${process.env.PAGSEGURO_URL}/orders`, body, config);
        
        // Verifica o status da cobrança
        const charge = response.data.charges[0];
        
        return {
            id: response.data.id,
            status: charge.status, // EX: 'PAID', 'DECLINED'
            message: charge.payment_response ? charge.payment_response.message : 'Processado'
        };

    } catch (error) {
        console.error("ERRO CARTÃO PAGSEGURO:", error.response?.data || error.message);
        throw new Error("Erro ao processar Cartão.");
    }
};