const express = require('express');
const router = express.Router();

const transporter = require('./../config/email');
const Activity = require('../models/Activity');
const User = require('./../models/User');

// @desc    Show landing page: all public activities
// @route   GET /
router.get('/', async (req, res) => {
    try {
        const activities = await Activity.find({ status: 'public' })
            .populate('leaderUser')
            .populate('creatorUser')
            .sort({ date: 'asc', time: 'asc' })
            .lean();
        
        res.render('index', {
            activities
        });
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
});

// @desc    Show questions page (for users to send questions to admin)
// @route   GET /questions
router.get('/questions', async (req, res) => {
    res.render('questions');
});

// @desc    Process questions form
// @route   POST /questions
router.post('/questions', async (req, res) => {
    const { name, email, phone, questions } = req.body;

    try {
        // Find the admin users
        const adminUsers = await User.find({ admin: true }).lean();

        // Create a string of the email recipients (admin with emails + TODO: activity creator and leader, if applicable)
        let emailRecipients = "";
        adminUsers.forEach(admin => {
            if (admin.email.length > 0) {
                emailRecipients += `${admin.email},`;
            }
        });

        //Create and send an email with the question(s)
        const emailContent = {
            from: `${process.env.EMAIL}`,
            to: `${emailRecipients}`,
            subject: `Virtual Connections Question(s) From ${name}`,
            html: `
                    <h1>A question was submitted by ${name} to the Connecting With Parma Heights Seniors - Virtual Activities website </h1>
                    <h3>Question(s):</h3>
                    <p>"${questions}"</p>
                    <h3>${name}'s Contact Information:</h3>
                    <p><b>Phone Number:</b> ${phone}</p>
                    <p><b>Email:</b> ${email}</p>
                `
        };

        transporter.sendMail(emailContent, (e, data) => {
            if (e) {
                console.log(e);
                req.flash('error_msg', "We're sorry. Something went wrong. Your questions were not submitted.");
                res.redirect('/');
            } else {
                req.flash('success_msg', 'Your questions were successfully submitted!');
                res.redirect('/');
            }
        });
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
});

// @desc    Show activities sign up page
// @route   GET /sign-up
router.get('/sign-up', async (req, res) => {
    try {
        const activities = await Activity.find({ status: 'public' })
            .populate('leaderUser')
            .populate('creatorUser')
            .sort({ date: 'asc', time: 'asc' })
            .lean();
        
        res.render('sign-up', {
            user: req.user,
            activities
        });
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
});

// @desc    Process activities sign-up form
// @route   POST /sign-up
router.post('/sign-up', async (req, res) => {
    let { name, email, phone, selectedActivities } = req.body;
    let errors = [];

    // Check required fields
    if (!name || !email || !phone || !selectedActivities) {
        errors.push({ msg: 'Please fill in all fields. '});
    }

    // Make sure all submitted activities are valid
    if (selectedActivities) {
        // Make selectedActivities an array if only one activity was selected
        if (!Array.isArray(selectedActivities)) {
            selectedActivities = [ selectedActivities ];
        }

        selectedActivities.forEach(async activity => {
            try {
                if (!await Activity.findOne({ _id: activity }).lean()) {
                    return errors.push({ msg: 'Please submit valid activities. '});
                }
            } catch (e) {
                console.log(e);
                req.flash('error_msg', "We're sorry. Something went wrong.");
                res.redirect('/');
            }
        });
    }

    // If there are errors, re-render the page with the errors
    if (errors.length > 0) {
        try {
            const activities = await Activity.find({ status: 'public' })
                .populate('leaderUser')
                .populate('creatorUser')
                .sort({ createdAt: 'desc' })
                .lean();
            
            res.render('sign-up', {
                user: req.user,
                activities,
                errors
            });
        } catch (e) {
            console.log(e);
            req.flash('error_msg', "We're sorry. Something went wrong.");
            res.redirect('/');
        }
    } else { // Validation passed
        // Update the activities with the RSVPs
        selectedActivities.forEach(async activity => {
            try {
                // Make sure the user hasn't already signed up for this activity
                const savedActivity = await Activity.findOne({ _id: activity }).lean();
                const found = savedActivity.rsvps.find(rsvp => rsvp.email == email);

                // If the user hasn't already signed up for this activity, save a new rsvp to this activity
                if (!found) {
                    try {
                        const newRsvp = {
                            name,
                            email,
                            phone
                        };
                        await Activity.updateOne({ _id: activity }, { $push: { rsvps: newRsvp } });
                    } catch (e) {
                        console.log(e);
                        req.flash('error_msg', "We're sorry. Something went wrong.");
                        res.redirect('/');
                    }
              }
            } catch (e) {
                console.log(e);
                req.flash('error_msg', "We're sorry. Something went wrong.");
                res.redirect('/');
            }
        });

        req.flash('success_msg', 'You are successfully signed up!');
        res.redirect('/');
    }
    
});

module.exports = router;