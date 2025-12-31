const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.FIREBASE_API_KEY;

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