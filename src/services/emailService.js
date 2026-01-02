const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.FIREBASE_API_KEY;

// TESTE DE DEPURAÇÃO (Adicione isso para ver no terminal se a chave aparece)
console.log("--- DEBUG EMAIL SERVICE ---");
console.log("Chave lida:", API_KEY ? API_KEY.slice(0, 5) + "..." : "NÃO ENCONTRADA");
console.log("---------------------------");

// URLs da API do Google Identity Toolkit
const VERIFY_URL = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${API_KEY}`;

// 1. Enviar E-mail de Verificação (Cadastro)
exports.sendVerificationEmail = async (email) => {
    try {
        // Pede ao Google para enviar o email
        // Tipo "VERIFY_EMAIL" faz o Google mandar aquele email padrão de ativar conta
        await axios.post(VERIFY_URL, {
            requestType: "VERIFY_EMAIL",
            email: email
        });
        
        console.log("✅ Google enviou e-mail de verificação para:", email);
        return true;
    } catch (error) {
        console.error("Erro Google Email:", error.response ? error.response.data.error.message : error.message);
        // Dica: O erro "EMAIL_NOT_FOUND" acontece se o usuário não estiver criado no Firebase Auth
        return false;
    }
};

// 2. Enviar Recuperação de Senha (Esqueci minha senha)
exports.sendResetEmail = async (email) => {
    try {
        // Tipo "PASSWORD_RESET" faz o Google mandar o link de trocar senha
        await axios.post(VERIFY_URL, {
            requestType: "PASSWORD_RESET",
            email: email
        });

        console.log("✅ Google enviou e-mail de senha para:", email);
        return true;
    } catch (error) {
        console.error("Erro Google Reset:", error.response ? error.response.data.error.message : error.message);
        return false;
    }
};

// ATUALIZAÇÃO DA FUNÇÃO DE STATUS
exports.sendOrderStatusEmail = async (toEmail, userName, orderId, status) => {
    let subject = `Atualização do Pedido #${orderId.slice(0, 6).toUpperCase()}`;
    let messageHtml = '';

    if (status === 'Aguardando Retirada') {
        subject = 'Seu pedido está pronto para retirada! 🛍️';
        messageHtml = `
            <h2 style="color: #27ae60;">Oba! Tudo pronto.</h2>
            <p>Olá <strong>${userName}</strong>, separamos suas peças.</p>
            <p>Você já pode vir buscar no nosso endereço:</p>
            
            <div style="background:#f9f9f9; padding:15px; border-left: 4px solid #27ae60; margin: 15px 0;">
                <strong>Endereço:</strong> Rua da Loja, 123 - Bairro<br>
                <strong>Cidade:</strong> Cidade / UF<br>
                <strong>Horário:</strong> 09h às 18h
            </div>
            
            <p style="font-size:12px;">*Traga um documento ou o número do pedido.</p>
        `;
    } else if (status === 'Enviado') {
        subject = 'Seu pedido está a caminho! 🚚';
        messageHtml = `
            <h2>Oba! Saiu para entrega.</h2>
            <p>Olá <strong>${userName}</strong>, acabamos de enviar seu pacote.</p>
            <p>Você pode acompanhar o rastreio diretamente no site em "Meus Pedidos".</p>
        `;
    } else {
        // Outros status
        messageHtml = `<p>O status do seu pedido mudou para: <strong>${status}</strong>.</p>`;
    }

    // HTML Final
    const finalHtml = `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
            ${messageHtml}
            <div style="text-align: center; margin-top: 30px;">
                <a href="https://loja-prima.onrender.com/pedidos" style="background: black; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px;">Ver Meus Pedidos</a>
            </div>
        </div>
    `;

    // Envia usando a função genérica que criamos antes
    await sendEmailViaAPI(toEmail, subject, finalHtml);
};