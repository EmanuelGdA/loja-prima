const axios = require('axios');

// Função Auxiliar para montar o cliente (Formatando dados para o padrão PagBank)
const buildCustomer = (cliente, cpf) => {
    // Remove tudo que não é número do CPF
    const cleanCPF = cpf ? cpf.replace(/\D/g, '') : '';
    
    return {
        name: cliente.name,
        email: cliente.email,
        tax_id: cleanCPF,
        phones: [
            {
                country: "55",
                area: "11",
                number: "999999999", // Telefone fixo para passar na validação se não tiver
                type: "MOBILE"
            }
        ]
    };
};

// 1. PIX
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    try {
        console.log("--- INICIANDO PIX PAGSEGURO ---");
        
        // Converte valor para centavos (Inteiro)
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        
        const body = {
            reference_id: pedido.id,
            customer: buildCustomer(cliente, cpf),
            items: [
                {
                    reference_id: "1",
                    name: "Pedido Loja",
                    quantity: 1,
                    unit_amount: valorEmCentavos
                }
            ],
            qr_codes: [
                {
                    amount: {
                        value: valorEmCentavos
                    },
                    kind: "CALENDAR"
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

        console.log("ENVIANDO DADOS:", JSON.stringify(body));

        const response = await axios.post(`${process.env.PAGSEGURO_URL}/orders`, body, config);
        
        console.log("RESPOSTA SUCESSO:", response.data.id);

        return {
            id: response.data.id,
            status: 'Aguardando Pagamento',
            qrCodeText: response.data.qr_codes[0].text
        };

    } catch (error) {
        // AQUI ESTÁ O SEGREDO: Vamos mostrar o erro real do PagSeguro
        console.error("--- ERRO PAGSEGURO DETALHADO ---");
        
        if (error.response) {
            // O PagSeguro respondeu com o motivo do erro
            console.error("Status:", error.response.status);
            console.error("Dados do Erro:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Erro de Rede/Código:", error.message);
        }
        
        throw new Error("Falha ao comunicar com PagSeguro");
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
                'Content-Type': 'application/json',
                'accept': '*/*'
            }
        };

        const response = await axios.post(`${process.env.PAGSEGURO_URL}/orders`, body, config);
        const charge = response.data.charges[0];
        
        return {
            id: response.data.id,
            status: charge.status, 
            message: charge.payment_response ? charge.payment_response.message : 'Processado'
        };

    } catch (error) {
        console.error("--- ERRO CARTÃO PAGSEGURO ---");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        throw new Error("Erro ao processar Cartão.");
    }
};