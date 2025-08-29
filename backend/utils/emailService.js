const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (to, subject, text, html) => {
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'no-reply@itradebook.com',
        to,
        subject,
        text,
        html
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', to);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        return false;
    }
};

module.exports = {
    sendEmail
};
