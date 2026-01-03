const axios = require('axios');

// Função auxiliar: Formata dados do cliente para o padrão rigoroso do PagBank
const buildCustomer = (cliente, cpf) => {
    // Limpa CPF
    const cleanCPF = cpf ? cpf.replace(/\D/g, '') : '';
    
    // Tenta usar o telefone do cliente, ou usa um fixo de segurança
    // O PagSeguro exige Area (DDD) + Numero
    let area = "11";
    let number = "999999999";

    if (cliente.phone && cliente.phone.length >= 10) {
        const cleanPhone = cliente.phone.replace(/\D/g, '');
        area = cleanPhone.substring(0, 2);
        number = cleanPhone.substring(2);
    }

    return {
        name: cliente.name,
        email: cliente.email,
        tax_id: cleanCPF,
        phones: [
            {
                country: "55",
                area: area,
                number: number,
                type: "MOBILE"
            }
        ]
    };
};

// 1. OBTER CHAVE PÚBLICA (Para Criptografia do Cartão no Frontend)
exports.getPublicKey = async () => {
    try {
        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };
        // URL baseada no ambiente (Sandbox ou Produção)
        const url = (process.env.PAGSEGURO_URL || 'https://api.pagseguro.com') + '/public-keys';
        
        const response = await axios.post(url, { type: "card" }, config);
        return response.data.public_key;

    } catch (error) {
        console.error("Erro ao pegar Chave Pública:", error.response?.data || error.message);
        throw error;
    }
};

// 2. GERAR PIX REAL
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    try {
        console.log("--- GERANDO PIX NO PAGBANK ---");
        
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        
        const body = {
            reference_id: pedido.id,
            customer: buildCustomer(cliente, cpf),
            items: [
                {
                    reference_id: "1",
                    name: "Pedido Loja Maely",
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
            ],
            notification_urls: [
                "https://loja-prima.onrender.com/api/webhook/pagseguro"
            ]
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': '*/*'
            }
        };

        const url = (process.env.PAGSEGURO_URL || 'https://api.pagseguro.com') + '/orders';
        const response = await axios.post(url, body, config);
        
        // O PagSeguro v4 retorna o texto do QR Code
        const qrCodeData = response.data.qr_codes[0];

        return {
            id: response.data.id,
            status: 'Aguardando Pagamento',
            qrCodeText: qrCodeData.text 
        };

    } catch (error) {
        console.error("ERRO PIX PAGSEGURO:");
        if (error.response) console.error(JSON.stringify(error.response.data, null, 2));
        throw new Error("Falha na comunicação com o banco.");
    }
};

// 3. PROCESSAR CARTÃO DE CRÉDITO REAL
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, encryptedCard, holder, installments) => {
    try {
        console.log("--- PROCESSANDO CARTÃO NO PAGBANK ---");
        
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
                        capture: true, // Cobra na hora
                        card: {
                            encrypted: encryptedCard, // O código gerado no frontend
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

        const url = (process.env.PAGSEGURO_URL || 'https://api.pagseguro.com') + '/orders';
        const response = await axios.post(url, body, config);
        
        const charge = response.data.charges[0];
        
        // Retorna status (PAID, DECLINED, AUTHORIZED)
        return {
            id: response.data.id,
            status: charge.status, 
            message: charge.payment_response ? charge.payment_response.message : 'Processado'
        };

    } catch (error) {
        console.error("ERRO CARTÃO PAGSEGURO:");
        if (error.response) {
            // Log detalhado do erro para ajudar
            console.error(JSON.stringify(error.response.data, null, 2));
        }
        throw new Error("Pagamento recusado ou dados inválidos.");
    }
};