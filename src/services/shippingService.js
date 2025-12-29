const axios = require('axios');

exports.calcularFrete = async (cepDestino, produtos) => {
    try {
        console.log("--- INICIANDO CÁLCULO MELHOR ENVIO ---");
        
        const token = process.env.MELHOR_ENVIO_TOKEN;
        const url = process.env.MELHOR_ENVIO_URL;
        const cepOrigem = process.env.CEP_ORIGEM;

        // 1. Verificação de Segurança
        if (!cepOrigem || cepOrigem === '00000000') {
            console.error("ERRO FATAL: CEP de Origem não configurado no .env");
            throw new Error("Configuração de CEP inválida");
        }

        // 2. Formatação Blindada (Garante que tudo é número)
        const produtosFormatados = produtos.map(prod => ({
            id: prod.id,
            width: parseInt(prod.width) || 20,       // Se falhar, usa 20cm
            height: parseInt(prod.height) || 5,      // Se falhar, usa 5cm
            length: parseInt(prod.length) || 20,     // Se falhar, usa 20cm
            weight: parseFloat(prod.weight) || 0.3,  // Se falhar, usa 300g
            insurance_value: parseFloat(prod.price) || 10.00, // Valor segurado (Min R$ 10)
            quantity: 1
        }));

        const body = {
            from: { postal_code: cepOrigem },
            to: { postal_code: cepDestino },
            products: produtosFormatados,
            options: {
                receipt: false,
                own_hand: false
            }
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Loja da Prima (contato@lojadaprima.com.br)' // Boa prática
            }
        };

        // console.log("Enviando dados:", JSON.stringify(body)); // Descomente para ver o que está enviando

        const response = await axios.post(`${url}/me/shipment/calculate`, body, config);

        // 3. Filtragem e Ordenação
        const opcoes = response.data
            .filter(opcao => !opcao.error) 
            .filter(opcao => {
                const nome = opcao.company.name.toLowerCase();
                // Aceita Loggi e Correios
                return nome.includes('loggi') || nome.includes('correios');
            })
            .map(opcao => ({
                nome: opcao.company.name + " " + opcao.name,
                logo: opcao.company.picture,
                preco: parseFloat(opcao.price), // Garante número
                prazo: opcao.delivery_time,
                id: opcao.id,
                isLoggi: opcao.company.name.toLowerCase().includes('loggi')
            }))
            .sort((a, b) => {
                // Loggi sempre primeiro
                if (a.isLoggi && !b.isLoggi) return -1;
                if (!a.isLoggi && b.isLoggi) return 1;
                // Depois, o mais barato
                return a.preco - b.preco;
            });

        return opcoes;

    } catch (error) {
        // LOG DETALHADO NO TERMINAL (Aqui você descobre o erro!)
        console.error("❌ ERRO MELHOR ENVIO:");
        if (error.response) {
            console.error("Status:", error.response.status);
            // Mostra a mensagem exata da API (ex: CEP inválido)
            console.error("Detalhes:", JSON.stringify(error.response.data, null, 2)); 
        } else {
            console.error(error.message);
        }
        throw new Error("Não foi possível calcular o frete.");
    }
};