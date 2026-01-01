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
        console.log("--- INICIANDO PIX (SANDBOX/REAL) ---");
        
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);
        
        // Dados do Cliente (Limpa CPF)
        const cleanCPF = cpf ? cpf.replace(/\D/g, '') : '';
        
        // Estrutura do Pedido (Payload)
        const body = {
            reference_id: pedido.id,
            customer: {
                name: cliente.name,
                email: cliente.email,
                tax_id: cleanCPF,
                phones: [{ country: "55", area: "11", number: "999999999", type: "MOBILE" }]
            },
            items: [{ reference_id: "1", name: "Pedido Loja Maely", quantity: 1, unit_amount: valorEmCentavos }],
            qr_codes: [{ amount: { value: valorEmCentavos }, kind: "CALENDAR" }],
            notification_urls: ["https://loja-prima.onrender.com/api/webhook/pagseguro"]
        };

        // --- IMPORTANTE: VAMOS IMPRIMIR ISSO PARA MANDAR PRO MAURÍCIO ---
        console.log("JSON REQUEST (SANDBOX):", JSON.stringify(body, null, 2));

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'accept': '*/*'
            }
        };

        // Usa a URL que configuramos no passo 1 (Sandbox)
        const response = await axios.post(`${process.env.PAGSEGURO_URL}/orders`, body, config);
        
        console.log("JSON RESPONSE (SUCESSO):", JSON.stringify(response.data, null, 2));

        return {
            id: response.data.id,
            status: 'Aguardando Pagamento',
            qrCodeText: response.data.qr_codes[0].text
        };

    } catch (error) {
        console.error("--- ERRO NO PAGSEGURO ---");
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        throw new Error("Erro na comunicação com PagBank.");
    }

// Mantenha a função de cartão simulada ou vazia se não for testar cartão agora
exports.processarCartaoPagSeguro = async () => { return { status: 'ERROR' }; };