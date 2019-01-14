const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
    "host": "smtp.sina.com",
    "port": 465,
    "secureConnection": true, // use SSL
    "auth": {
        "user": 'haomiao_azkaban@sina.com', // user name
        "pass": 'haomiao!@#'         // password
    }
});
