require('dotenv').config(); // Garante que lê as variáveis
const nodemailer = require('nodemailer');

// CONFIGURAÇÃO ROBUSTA (SMTP)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Servidor do Google
    port: 587,              // Porta padrão segura (TLS)
    secure: false,          // false para porta 587 (true seria para 465)
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false // Aceita conexões do servidor do Render
    }
});

// Teste de conexão no início
transporter.verify(function (error, success) {
    if (error) {
        console.error("❌ ERRO CONEXÃO EMAIL:", error.message);
    } else {
        console.log("✅ Conectado ao Gmail com sucesso!");
    }
});

// Função 1: Recuperação de Senha
exports.sendResetEmail = async (toEmail, token) => {
    // Detecta URL automaticamente
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/redefinir-senha/${token}`;

    const mailOptions = {
        from: '"Maely Cristina Store" <' + process.env.EMAIL_USER + '>',
        to: toEmail,
        subject: 'Recuperação de Senha',
        html: `<p>Clique para redefinir: <a href="${resetLink}">Nova Senha</a></p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Email Reset enviado para:", toEmail);
    } catch (error) {
        console.error("Erro Reset:", error);
    }
};

// Função 2: Código de Verificação
exports.sendVerificationEmail = async (toEmail, code) => {
    const mailOptions = {
        from: '"Maely Cristina Store" <' + process.env.EMAIL_USER + '>',
        to: toEmail,
        subject: 'Seu Código de Acesso',
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; text-align: center;">
                <h2>Bem-vindo(a)!</h2>
                <p>Seu código de verificação é:</p>
                <div style="font-size: 24px; font-weight: bold; background: #eee; padding: 10px; margin: 20px 0;">
                    ${code}
                </div>
            </div>
        `
    };

    try {
        console.log(`Enviando código ${code} para ${toEmail}...`);
        await transporter.sendMail(mailOptions);
        console.log("✅ Email de Código enviado com sucesso!");
    } catch (error) {
        // Mostra o erro exato
        console.error("❌ FALHA ENVIO CÓDIGO:", error.message);
        if (error.response) console.error("Resposta Google:", error.response);
    }
};