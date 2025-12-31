require('dotenv').config();
const nodemailer = require('nodemailer');

// SEU EMAIL QUE VAI APARECER PARA O CLIENTE
// (Coloque aqui o gmail que você usou para criar a conta no Brevo)
const EMAIL_REMETENTE = 'emanuelgomesalmeida@gmail.com'; 

// CONFIGURAÇÃO BREVO
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, 
    auth: {
        user: process.env.EMAIL_USER, // O login estranho (9f14...)
        pass: process.env.EMAIL_PASS  // A senha do Brevo (X5JL...)
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error("❌ ERRO CONEXÃO EMAIL:", error.message);
    } else {
        console.log("✅ Conectado ao Brevo! Pronto para enviar.");
    }
});

exports.sendResetEmail = async (toEmail, token) => {
    const baseUrl = 'https://loja-prima.onrender.com';
    const resetLink = `${baseUrl}/redefinir-senha/${token}`;

    const mailOptions = {
        from: `"Maely Cristina Store" <${EMAIL_REMETENTE}>`, // <--- Mudamos aqui
        to: toEmail,
        subject: 'Recuperação de Senha',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2>Recuperação de Senha</h2>
                <p>Clique no botão abaixo para criar uma nova senha:</p>
                <a href="${resetLink}" style="background: black; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Redefinir Senha</a>
            </div>
        `
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
        from: `"Maely Cristina Store" <${EMAIL_REMETENTE}>`, // <--- Mudamos aqui
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