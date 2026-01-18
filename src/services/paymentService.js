const { MercadoPagoConfig, Payment } = require('mercadopago');
require('dotenv').config();

// Configura o Cliente com o Access Token (Privado) da Maely
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN, 
    options: { timeout: 10000 } 
});

const payment = new Payment(client);

// 1. GERAR PIX MERCADO PAGO
exports.gerarPixMercadoPago = async (pedido, cliente, cpf) => {
    try {
        console.log("--- GERANDO PIX NO MERCADO PAGO ---");

        const body = {
            transaction_amount: parseFloat(pedido.totalPrice),
            description: `Pedido #${pedido.id} - Maely Cristina`,
            external_reference: pedido.id, // VITAL para o Webhook saber qual pedido atualizar
            notification_url: "https://www.maelycristina.com.br/api/webhook/mp", // URL oficial
            payment_method_id: 'pix',
            payer: {
                email: cliente.email,
                first_name: cliente.name.split(' ')[0],
                last_name: cliente.name.split(' ').slice(1).join(' ') || 'Cliente',
                identification: {
                    type: 'CPF',
                    number: cpf.replace(/\D/g, '')
                }
            }
        };

        const response = await payment.create({ body });
        
        return {
            id: response.id.toString(),
            status: 'Aguardando Pagamento',
            qrCodeText: response.point_of_interaction.transaction_data.qr_code,
            qrCodeBase64: response.point_of_interaction.transaction_data.qr_code_base64
        };
    } catch (error) {
        console.error("Erro MP Pix:", error);
        throw new Error("Não foi possível gerar o PIX. Tente novamente.");
    }
};

// 2. PROCESSAR CARTÃO MERCADO PAGO
exports.processarCartaoMercadoPago = async (pedido, cliente, cpf, cardToken, installments, paymentMethodId, issuerId) => {
    try {
        console.log("--- ENVIANDO CARTÃO AO MERCADO PAGO ---");

        const body = {
            transaction_amount: parseFloat(pedido.totalPrice),
            token: cardToken,
            description: `Pedido #${pedido.id} - Maely Cristina`,
            external_reference: pedido.id, // VITAL para o Webhook
            notification_url: "https://www.maelycristina.com.br/api/webhook/mp",
            installments: parseInt(installments),
            payment_method_id: paymentMethodId, 
            issuer_id: issuerId ? parseInt(issuerId) : undefined,
            payer: {
                email: cliente.email,
                identification: {
                    type: 'CPF',
                    number: cpf.replace(/\D/g, '')
                }
            }
        };

        const response = await payment.create({ body });
        
        // Mapeia o status do MP para o sistema da loja
        let statusFinal = 'Recusado';
        if (response.status === 'approved') statusFinal = 'Pago / Aprovado';
        if (response.status === 'in_process') statusFinal = 'Em Análise';

        return {
            id: response.id.toString(),
            status: statusFinal,
            message: response.status_detail
        };

    } catch (error) {
        // Log detalhado para você ver no Render caso o cartão seja recusado
        console.error("Erro detalhado MP:", error.cause ? error.cause[0] : error);
        throw new Error("O cartão foi recusado ou os dados estão incorretos.");
    }
};