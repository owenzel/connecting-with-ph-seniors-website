const transporter = require('../config/email');
const { formatDate } = require('./ejs-helpers');

module.exports = {
    activityEmail: async function(emailTitle, recipient, activities) {
        let messageBody = `<h2>${emailTitle}</h2>`;
        let counter = 1;
        activities.forEach(activity => {
            messageBody += `<h3>${counter}. <b>${activity.title}</b></h3>
                    <p><b>Occurs at:</b> ${formatDate(activity.date, 'MMMM Do YYYY, h:mm a')}</p>
                    <p><b>Leader:</b> ${activity.leaderUser ? activity.leaderUser.name : activity.leaderName}</p>
                    <p><b>Description:</b> ${activity.body}</p>`;
            counter++;
        });
    
        const emailContent = {
            from: `${process.env.EMAIL}`,
            to: `${recipient}`,
            subject: `${emailTitle}`,
            html: `${messageBody}`
        };
    
        transporter.sendMail(emailContent, (e, data) => {
            if (e) {
                console.log(e);
                return false;
            } else {
                // Redirect to the my activities page with a success message
                return true;
            }
        });
    }
}