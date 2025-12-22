const axios = require('axios');

exports.calcularFrete = async (cepDestino, produtos) => {
    try {
        const token = process.env.MELHOR_ENVIO_TOKEN;
        const url = process.env.MELHOR_ENVIO_URL;
        const cepOrigem = process.env.CEP_ORIGEM;

        // O Melhor Envio exige as dimensões do produto.
        // Como ainda não temos isso no cadastro, vamos usar valores padrão de uma "caixa de roupa"
        // Futuramente, você deve adicionar altura/largura/peso no cadastro do produto.
        const produtosFormatados = produtos.map(prod => ({
            id: prod.id,
            width: prod.width || 20,  // cm
            height: prod.height || 5, // cm
            length: prod.length || 20, // cm
            weight: prod.weight || 0.3, // kg (300g)
            insurance_value: prod.price, // Valor para seguro
            quantity: 1
        }));

        const body = {
            from: { postal_code: cepOrigem },
            to: { postal_code: cepDestino },
            products: produtosFormatados,
            options: {
                receipt: false,
                own_hand: false
            },
            
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const response = await axios.post(`${url}/me/shipment/calculate`, body, config);

        // O Melhor Envio retorna uma lista de transportadoras.
        
        // FILTRAGEM INTELIGENTE
        
        const opcoes = response.data
            .filter(opcao => !opcao.error) // Remove erros
            .filter(opcao => {
                // Filtra SÓ Loggi e Correios
                const nome = opcao.company.name.toLowerCase();
                return nome.includes('loggi') || nome.includes('correios');
            })
            .map(opcao => ({
                nome: opcao.company.name + " " + opcao.name,
                logo: opcao.company.picture,
                preco: parseFloat(opcao.price),
                prazo: opcao.delivery_time,
                id: opcao.id,
                // Campo auxiliar para ajudar na ordenação
                isLoggi: opcao.company.name.toLowerCase().includes('loggi')
            }))
            .sort((a, b) => {
                // REGRA DE OURO DA ORDENAÇÃO:
                // 1. Se 'a' é Loggi e 'b' não é, 'a' vem primeiro.
                if (a.isLoggi && !b.isLoggi) return -1;
                if (!a.isLoggi && b.isLoggi) return 1;
                
                // 2. Se ambos forem iguais (ou ambos Correios), o mais barato ganha.
                return a.preco - b.preco;
            });

        return opcoes;

    } catch (error) {
        console.error("Erro Melhor Envio:", error.response ? error.response.data : error.message);
        throw new Error("Não foi possível calcular o frete.");
    }
};