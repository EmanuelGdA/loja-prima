const nodemailer = require('nodemailer');

// 1. Configuração do "Carteiro"
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        // Agora o código busca das configurações do servidor
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
    },
    tls: { rejectUnauthorized: false }
});

// 2. Função para "Esqueci Minha Senha" (Link)
exports.sendResetEmail = async (toEmail, token) => {
    const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://loja-da-prima.onrender.com' 
        : 'http://localhost:3000';
        
    const resetLink = `${baseUrl}/redefinir-senha/${token}`;

    const mailOptions = {
        from: '"Maely Cristina Store" <emanuelgomesalmeida@gmail.com>',
        to: toEmail,
        subject: 'Recuperação de Senha',
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #000;">Esqueceu sua senha?</h2>
                <p>Clique no botão abaixo para criar uma nova:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="background: black; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Redefinir Senha</a>
                </div>
                <p style="font-size: 12px; color: #999;">Link válido por 1 hora.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(">> Link de senha enviado para:", toEmail);
    } catch (error) {
        console.error(">> Erro ao enviar link de senha:", error.message);
    }
};

// 3. Função para "Confirmar Conta" (Código de 6 dígitos)
exports.sendVerificationEmail = async (toEmail, code) => {
    const mailOptions = {
        from: '"Maely Cristina Store" <emanuelgomesalmeida@gmail.com>',
        to: toEmail,
        subject: 'Seu código de acesso - Maely Cristina',
        html: `
            <div style="font-family: sans-serif; text-align: center; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #000;">Bem-vindo(a)!</h2>
                <p style="color: #666;">Use o código abaixo para confirmar sua conta e entrar no site:</p>
                
                <div style="background: #f4f4f4; padding: 15px; font-size: 28px; font-weight: 800; letter-spacing: 5px; margin: 20px 0; color: #000; border-radius: 5px;">
                    ${code}
                </div>
                
                <p style="color: #999; font-size: 12px;">Se você não solicitou este código, ignore este e-mail.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(">> Código de verificação enviado para:", toEmail);
    } catch (error) {
        console.error(">> Erro ao enviar código por e-mail:", error.message);
    }
};