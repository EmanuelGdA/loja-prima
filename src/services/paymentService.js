const { MercadoPagoConfig, Payment } = require('mercadopago');

// Configura o cliente com a chave do .env
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

exports.gerarPixMercadoPago = async (pedido, cliente, cpf) => {
    try {
        // Limpa o CPF (deixa só números)
        const cleanCPF = cpf.replace(/\D/g, '');
        
        // Separa nome e sobrenome (o MP exige)
        const nameParts = cliente.name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Cliente';

        const body = {
            transaction_amount: parseFloat(pedido.totalPrice),
            description: `Pedido #${pedido.id} - Loja da Prima`,
            payment_method_id: 'pix',
            payer: {
                email: cliente.email,
                first_name: firstName,
                last_name: lastName,
                identification: {
                    type: 'CPF',
                    number: cleanCPF
                }
            },
            notification_url: 'https://seusite.com/webhook' // (Opcional por enquanto)
        };

        // Envia para o Mercado Pago
        const response = await payment.create({ body });
        
        // Pega os dados que interessam
        const paymentData = response; 
        
        return {
            id: paymentData.id,
            status: paymentData.status,
            // O código "Copia e Cola"
            qrCode: paymentData.point_of_interaction.transaction_data.qr_code,
            // A imagem em Base64 (já vem pronta para exibir!)
            qrCodeBase64: paymentData.point_of_interaction.transaction_data.qr_code_base64
        };

    } catch (error) {
        console.error("ERRO MERCADO PAGO:", error);
        throw new Error("Erro ao gerar Pix no Mercado Pago");
    }
};