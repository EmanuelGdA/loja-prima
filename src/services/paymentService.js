const axios = require('axios');

exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    try {
        // Limpa CPF (remove pontos e traços)
        const cleanCPF = cpf.replace(/\D/g, '');
        
        // PagSeguro exige valor em CENTAVOS (R$ 100,00 = 10000)
        const valorEmCentavos = Math.round(pedido.totalPrice * 100);

        const body = {
            reference_id: pedido.id,
            customer: {
                name: cliente.name,
                email: cliente.email,
                tax_id: cleanCPF,
                // Telefones são obrigatórios no PagSeguro, vamos enviar um fixo se não tivermos
                phones: [
                    {
                        country: "55",
                        area: "11",
                        number: "999999999",
                        type: "MOBILE"
                    }
                ]
            },
            items: [
                {
                    reference_id: "item_01",
                    name: "Pedido Loja da Prima",
                    quantity: 1,
                    unit_amount: valorEmCentavos
                }
            ],
            qr_codes: [
                {
                    amount: {
                        value: valorEmCentavos
                    },
                    kind: "CALENDAR" // Tipo padrão para Pix imediato
                }
            ],
            notification_urls: [
                "https://seusite.com/webhook" // Opcional
            ]
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${process.env.PAGSEGURO_TOKEN}`,
                'Content-Type': 'application/json',
                'x-api-version': '4.0'
            }
        };

        // Envia para o PagSeguro (Endpoint de Pedidos)
        const response = await axios.post(`${process.env.PAGSEGURO_URL}/orders`, body, config);
        
        // O PagSeguro retorna o QR Code dentro de um array
        const qrCodeData = response.data.qr_codes[0];

        return {
            id: response.data.id,
            status: 'Aguardando Pagamento',
            qrCodeText: qrCodeData.text // O código "Copia e Cola"
        };

    } catch (error) {
        // Log detalhado para ajudar a achar erro
        console.error("ERRO PAGSEGURO:", error.response ? JSON.stringify(error.response.data) : error.message);
        throw new Error("Erro ao gerar Pix no PagSeguro. Verifique o CPF.");
    }
};