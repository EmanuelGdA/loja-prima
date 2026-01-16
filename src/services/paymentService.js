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
            external_reference: pedido.id, // <--- ESSENCIAL PARA O WEBHOOK SABER QUAL PEDIDO É
            notification_url: "https://www.maelycristina.com.br/api/webhook/mp",
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
            }
            
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

// 2. PROCESSAR CARTÃO MERCADO PAGO
exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, cardToken, installments, paymentMethodId, issuerId) => {
    try {
        console.log("--- ENVIANDO PAGAMENTO AO MERCADO PAGO ---");

        const body = {
            transaction_amount: parseFloat(pedido.totalPrice),
            external_reference: pedido.id, // <--- ESSENCIAL PARA O WEBHOOK SABER QUAL PEDIDO É
            notification_url: "https://www.maelycristina.com.br/api/webhook/mp",
            token: cardToken,
            description: `Pedido #${pedido.id}`,
            installments: parseInt(installments),
            payment_method_id: paymentMethodId, // ex: "visa", "master"
            issuer_id: issuerId ? parseInt(issuerId) : undefined, // Importante para alguns bancos
            payer: {
                email: cliente.email,
                identification: {
                    type: 'CPF',
                    number: cpf.replace(/\D/g, '')
                }
            }
            
        };

        const response = await payment.create({ body });
        
        let statusFinal = 'Recusado';
        if (response.status === 'approved') statusFinal = 'Pago / Aprovado';
        if (response.status === 'in_process') statusFinal = 'Em Análise';

        return {
            id: response.id.toString(),
            status: statusFinal,
            message: response.status_detail // Detalha se foi falta de limite, CCV errado, etc.
        };

    } catch (error) {
        console.error("Erro detalhado MP:", error.cause ? error.cause[0] : error);
        throw new Error("O cartão foi recusado ou os dados estão incorretos.");
    }
};