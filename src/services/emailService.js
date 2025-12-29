const nodemailer = require('nodemailer');

// Configuração do "Carteiro"
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'emanuelgomesalmeida@gmail.com', // COLOQUE SEU EMAIL AQUI
        pass: 'hecn klaw ormh ahcq'       // SENHA DE APP DO GOOGLE (Não é a senha normal)
    }
});

exports.sendResetEmail = async (toEmail, token) => {
    const resetLink = `https://loja-da-prima.onrender.com/redefinir-senha/${token}`;
    // Se estiver testando no PC, use: `http://localhost:3000/redefinir-senha/${token}`

    const mailOptions = {
        from: '"Maely Cristina Store" <seu.email.da.loja@gmail.com>',
        to: toEmail,
        subject: 'Recuperação de Senha - Maely Cristina',
        html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>Esqueceu sua senha?</h2>
                <p>Não se preocupe! Clique no botão abaixo para criar uma nova senha:</p>
                <a href="${resetLink}" style="background: black; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Redefinir Senha</a>
                <p style="margin-top: 20px; font-size: 12px; color: #888;">Se não foi você, ignore este e-mail. O link expira em 1 hora.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("E-mail de recuperação enviado para:", toEmail);
    } catch (error) {
        console.error("Erro ao enviar e-mail:", error);
        throw new Error("Falha no envio de e-mail.");
    }
};