require('dotenv').config();
const nodemailer = require('nodemailer');

// CONFIGURAÇÃO SMTP GMAIL (PORTA 465 - SSL IMPLÍCITO)
// Essa porta costuma funcionar melhor em servidores nuvem bloqueados
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,  // <--- MUDANÇA PRINCIPAL
    secure: true, // <--- TEM QUE SER TRUE NA PORTA 465
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // Aumentando timeouts para garantir
    connectionTimeout: 20000, 
    greetingTimeout: 20000,
    socketTimeout: 20000,
    tls: {
        rejectUnauthorized: false
    }
});

// Teste de conexão ao iniciar
transporter.verify((error, success) => {
    if (error) {
        console.error("❌ ERRO CONEXÃO EMAIL:", error.message);
    } else {
        console.log("✅ Conectado ao Gmail via Porta 465!");
    }
});

exports.sendResetEmail = async (toEmail, token) => {
    const baseUrl = 'https://loja-prima.onrender.com';
    const resetLink = `${baseUrl}/redefinir-senha/${token}`;

    const mailOptions = {
        from: `"Maely Cristina Store" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Recuperação de Senha',
        html: `<p>Clique para redefinir: <a href="${resetLink}">Nova Senha</a></p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("✅ Email Reset enviado.");
    } catch (error) {
        console.error("❌ Erro Reset:", error.message);
    }
};

exports.sendVerificationEmail = async (toEmail, code) => {
    const mailOptions = {
        from: `"Maely Cristina Store" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Seu Código de Acesso',
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; text-align: center; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #000;">Bem-vindo(a)!</h2>
                <p>Seu código de verificação é:</p>
                <div style="font-size: 28px; font-weight: bold; background: #f4f4f4; padding: 15px; margin: 20px 0; letter-spacing: 5px;">
                    ${code}
                </div>
            </div>
        `
    };

    try {
        console.log(`📡 Enviando código para ${toEmail}...`);
        await transporter.sendMail(mailOptions);
        console.log("✅ EMAIL ENVIADO COM SUCESSO!");
    } catch (error) {
        console.error("❌ FALHA NO ENVIO:", error.message);
    }
};