const nodemailer = require("nodemailer"); // for sending emails

// Configure Gmail SMTP transporter on nodemailer
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASSWORD
    }
});

module.exports = transporter;