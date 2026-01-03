require('dotenv').config();
const axios = require('axios');

exports.calcularFrete = async (cepDestino, produtos) => {
    try {
        // 1. Limpeza do CEP
        const cleanCep = cepDestino.replace(/\D/g, '');
        const prefix = cleanCep.substring(0, 2); // Pega os 2 primeiros dígitos

        // ==============================================================
        // CENÁRIO 1: CURITIBA E REGIÃO (80, 81, 82)
        // Retorna APENAS opções locais (sem chamar Melhor Envio)
        // ==============================================================
        if (prefix === '80' || prefix === '81' || prefix === '82') {
            console.log("Frete Local (Curitiba) detectado.");
            
            return [
                
                {
                    id: 'local_motoboy',
                    nome: 'Entrega Motoboy',
                    preco: 15.00, // Preço Fixo Curitiba
                    prazo: '1',   // 1 dia útil
                    logo: null    // Ou coloque uma URL de ícone de moto se quiser
                }
            ];
        }

        // ==============================================================
        // CENÁRIO 2: FORA DE CURITIBA (BRASIL)
        // Chama a API do Melhor Envio para calcular Loggi/Correios
        // ==============================================================
        
        console.log("Frete Nacional detectado. Consultando Melhor Envio...");
        
        const token = process.env.MELHOR_ENVIO_TOKEN;
        const url = process.env.MELHOR_ENVIO_URL;
        const cepOrigem = process.env.CEP_ORIGEM;

        if (!cepOrigem || !token) throw new Error("Configuração de Frete incompleta.");

        // Formata os produtos para a API
        const produtosFormatados = produtos.map(prod => ({
            id: prod.id,
            width: parseInt(prod.width) || 20,
            height: parseInt(prod.height) || 5,
            length: parseInt(prod.length) || 20,
            weight: parseFloat(prod.weight) || 0.3,
            insurance_value: parseFloat(prod.price) || 10.00,
            quantity: 1
        }));

        const body = {
            from: { postal_code: cepOrigem },
            to: { postal_code: cleanCep },
            products: produtosFormatados,
            options: { receipt: false, own_hand: false }
        };

        const config = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Loja Maely (contato@maely.com)'
            }
        };

        const response = await axios.post(`${url}/me/shipment/calculate`, body, config);

        // Filtra para mostrar apenas Loggi e Correios
        return response.data
            .filter(op => !op.error)
            .filter(op => {
                const nome = op.company.name.toLowerCase();
                return nome.includes('loggi') || nome.includes('correios');
            })
            .map(op => ({
                id: op.id,
                // Simplifica os nomes para ficar bonito na tabela rosa
                nome: op.company.name.includes('Loggi') ? 'Loggi Express' : 'Correios SEDEX', 
                logo: op.company.picture,
                preco: parseFloat(op.price),
                prazo: op.delivery_time
            }))
            .sort((a, b) => a.preco - b.preco); // O mais barato primeiro

    } catch (error) {
        console.error("Erro no Serviço de Frete:", error.message);
        // Em vez de quebrar, retorna erro legível
        throw new Error("Não foi possível calcular o frete.");
    }
};