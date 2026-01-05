const { MercadoPagoConfig, Payment } = require('mercadopago');
require('dotenv').config();

// Configura o Cliente com o Access Token (Privado)
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN, 
    options: { timeout: 10000 } 
});

const payment = new Payment(client);

// 1. GERAR PIX
exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    // Mantive o nome da função antigo para não quebrar o controller
    try {
        console.log("--- PIX MERCADO PAGO ---");

        const body = {
            transaction_amount: parseFloat(pedido.totalPrice),
            description: `Pedido #${pedido.id}`,
            payment_method_id: 'pix',
            payer: {
                email: cliente.email,
                first_name: cliente.name.split(' ')[0],
                last_name: cliente.name.split(' ').slice(1).join(' ') || 'Cliente',
                identification: {
                    type: 'CPF',
                    number: cpf.replace(/\D/g, '')
                }
            },
            notification_url: 'https://loja-prima.onrender.com/api/webhook/mp'
        };

        const response = await payment.create({ body });
        
        return {
            id: response.id.toString(),
            status: 'Aguardando Pagamento',
            qrCodeText: response.point_of_interaction.transaction_data.qr_code,
            // O MP já devolve a imagem em Base64 pronta
            qrCodeBase64: response.point_of_interaction.transaction_data.qr_code_base64
        };
    } catch (error) {
        console.error("Erro MP Pix:", error);
        throw new Error("Erro ao gerar Pix.");
    }
};

// 2. PROCESSAR CARTÃO
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, cardToken, installments, paymentMethodId) => {
    try {
        console.log("--- CARTÃO MERCADO PAGO ---");

        const body = {
            transaction_amount: parseFloat(pedido.totalPrice),
            token: cardToken, // O token gerado no frontend
            description: `Pedido #${pedido.id}`,
            installments: parseInt(installments), // Quantas parcelas
            payment_method_id: paymentMethodId,   // ex: "master", "visa"
            payer: {
                email: cliente.email,
                identification: {
                    type: 'CPF',
                    number: cpf.replace(/\D/g, '')
                }
            }
        };

        const response = await payment.create({ body });
        
        // Mapeia o status do MP para o nosso sistema
        let statusFinal = 'Recusado';
        if (response.status === 'approved') statusFinal = 'Pago / Aprovado';
        if (response.status === 'in_process') statusFinal = 'Em Análise';

        return {
            id: response.id.toString(),
            status: statusFinal,
            message: response.status_detail
        };

    } catch (error) {
        console.error("Erro MP Cartão:", error);
        throw new Error("Pagamento recusado.");
    }
};