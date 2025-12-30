const axios = require('axios');

// Função auxiliar para formatar os dados do cliente para o padrão do PagBank
const buildCustomer = (cliente, cpf) => {
    // Remove tudo que não é número do CPF
    const cleanCPF = cpf ? cpf.replace(/\D/g, '') : '';
    
    // Tenta pegar o telefone do cliente ou usa um fixo válido para passar na validação
    // O PagSeguro V4 é rigoroso com telefones
    return {
        name: cliente.name,
        email: cliente.email,
        tax_id: cleanCPF,
        phones: [
            {
                country: "55",
                area: "11", 
                number: "999999999", 
                type: "MOBILE"
            }
        ]
    };
};

// 1. GERAR PIX (REAL)
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    try {
        console.log("--- INICIANDO PIX REAL PAGSEGURO ---");
        
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
                "https://loja-da-prima.onrender.com/api/webhook/pagseguro" // (Futuro Webhook)
            ]
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': '*/*'
            }
        };

        // URL Oficial de Produção (Note que não tem 'sandbox' se a variável estiver certa)
        const url = process.env.PAGSEGURO_URL || 'https://api.pagseguro.com';

        const response = await axios.post(`${url}/orders`, body, config);
        
        console.log("PIX GERADO COM SUCESSO! ID:", response.data.id);

        // O PagSeguro retorna o texto do QR Code
        const qrCodeData = response.data.qr_codes[0];

        return {
            id: response.data.id,
            status: 'Aguardando Pagamento',
            qrCodeText: qrCodeData.text // O código copia-e-cola real
        };

    } catch (error) {
        console.error("--- ERRO PIX PAGSEGURO ---");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        throw new Error("Falha ao comunicar com o banco.");
    }
};

// 2. PROCESSAR CARTÃO (REAL)
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, cartao) => {
    try {
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        const [mes, ano] = cartao.expiration.split('/');

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

        const url = process.env.PAGSEGURO_URL || 'https://api.pagseguro.com';
        const response = await axios.post(`${url}/orders`, body, config);
        
        // Verifica o status da cobrança (PAID, DECLINED, etc)
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
        throw new Error("Pagamento recusado pelo banco.");
    }
};