import "dotenv/config";

// Never send real mail from tests, even when the developer has Gmail
// configured in .env. Deleting it here (before any module reads it) forces
// nodemailer's jsonTransport, which renders the message and returns it.
delete process.env.SMTP_HOST;
