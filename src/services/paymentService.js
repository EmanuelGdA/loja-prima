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

exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    try {
        console.log("--- GERANDO LOG PARA PAGSEGURO ---");
        
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        
        // ESTE É O JSON QUE ELES QUEREM VER:
        const body = {
            reference_id: pedido.id,
            customer: buildCustomer(cliente, cpf),
            items: [{ reference_id: "1", name: "Pedido Loja Maely", quantity: 1, unit_amount: valorEmCentavos }],
            qr_codes: [{ amount: { value: valorEmCentavos }, kind: "CALENDAR" }],
            notification_urls: ["https://loja-da-prima.onrender.com/api/webhook/pagseguro"]
        };

        // Vamos imprimir isso no terminal para você copiar
        console.log("JSON REQUEST:", JSON.stringify(body, null, 2));

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': '*/*'
            }
        };

        const url = process.env.PAGSEGURO_URL || 'https://api.pagseguro.com';
        const response = await axios.post(`${url}/orders`, body, config);
        
        return {
            id: response.data.id,
            status: 'Aguardando Pagamento',
            qrCodeText: response.data.qr_codes[0].text
        };

    } catch (error) {
        // Se der erro (e vai dar), mostramos a resposta deles
        console.error("--- ERRO RESPOSTA PAGSEGURO ---");
        if (error.response) {
            console.error("JSON RESPONSE:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        throw new Error("Falha técnica (Log gerado)");
    }
};

// Mantenha a função de cartão simulada ou vazia se não for testar cartão agora
exports.processarCartaoPagSeguro = async () => { return { status: 'ERROR' }; };