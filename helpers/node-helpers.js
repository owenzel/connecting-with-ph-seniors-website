const transporter = require('../config/email');
const { formatDate } = require('./ejs-helpers');
const Activity = require('./../models/Activity');
const User = require('./../models/User');

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

        try {
            await transporter.sendMail(emailContent, (e, data) => {
                if (e) console.log(e);
            });

            return true;

        } catch (e) {
            console.log(e);
            return false;
        }
    },
    fetchPublishedActivites: async function() {
        try {
            const activities = await Activity.find({ status:{ $in:[ 'published', 'published and under review' ] } })
                .populate('leaderUser')
                .populate('creatorUser')
                .sort({ date: 'asc', time: 'asc' })
                .lean();
            return activities;
        } catch (e) {
            console.log(e);
            return null;
        }
    },
    fetchAPublishedActivityById: async function(id) {
        try {
            const activity = await Activity.findOne({ _id: id })
                .populate('leaderUser')
                .populate('creatorUser')
                .lean();
            return activity;
        } catch (e) {
            console.log(e);
            return null;
        }
    },
    fetchUsers: async function() {
        try {
            const users = await User.find({}).lean();
            return users;
        } catch (e) {
            console.log(e);
            return null;
        }
    },
    errorRedirect: function(req, res, error, redirect, msg = "We're sorry. Something went wrong.") {
        console.log(error);
        req.flash('error_msg', msg);
        res.redirect(redirect);
    },
    successRedirect: function(req, res, msg, redirect) {
        req.flash('success_msg', msg);
        res.redirect(redirect);
    }
}