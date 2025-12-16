// MODO SIMULAÇÃO (Para testar o site sem depender do Banco)

exports.gerarPixPagSeguro = async (pedido, cliente, cpf) => {
    console.log("--- SIMULANDO PIX (CONTA AINDA NÃO APROVADA) ---");
    
    // Simula um atraso de 1 segundo (como se fosse na internet)
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        id: "PEDIDO_SIMULADO_" + Math.floor(Math.random() * 1000),
        status: 'Aguardando Pagamento',
        // Esse é um texto aleatório só para gerar o desenho do QR Code na tela
        qrCodeText: "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5913Loja da Prima6008Sao Paulo62070503***6304ABCD"
    };
};

exports.processarCartaoPagSeguro = async (pedido, cliente, cpf, cartao) => {
    console.log("--- SIMULANDO CARTÃO (CONTA AINDA NÃO APROVADA) ---");
    
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Vamos fingir que deu certo
    return {
        id: "TRANSACAO_FAKE_" + Math.floor(Math.random() * 1000),
        status: 'PAID', // Finge que pagou
        message: 'Sucesso (Simulação)'
    };
};