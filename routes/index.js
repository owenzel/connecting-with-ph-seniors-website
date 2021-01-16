const express = require('express');
const router = express.Router();

const transporter = require('./../config/email');
const Activity = require('../models/Activity');
const User = require('./../models/User');

const questionCategories = [{ text: 'A Specific Activity', value: 'activity' }, { text: 'Using the Website', value: 'website' }, { text: 'Something Else', value: 'other' }];

// @desc    Show landing page: all published activities
// @route   GET /
router.get('/', async (req, res) => {
    try {
        const activities = await Activity.find({ status: 'published' })
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
    res.render('questions', { questionCategories });
});

// @desc    Process questions form
// @route   POST /questions
router.post('/questions', async (req, res) => {
    let { categoriesWereSubmitted, categories, name, email, phone, questions, activityInQuestion } = req.body;
    let errors = [];
    
    // Handle the user submitting part 1 of the form
    if (categoriesWereSubmitted) {
        // Ensure the user selected at least one category
        if (!categories) {
            errors.push({ msg: 'Please select at least one question category. '})
        // Ensure categories is an array
        } else if (!Array.isArray(categories)) {
            categories = [ categories ];
        }

        // If there are any errors, re-render the page with alerts to the user. Otherwise, render the page with part 2 of the form
        if (errors.length > 0) {
            res.render('questions', {
                errors,
                questionCategories
            });
        } else {
            let activities = null;
            // If the user has a question about a specific activity, get the activity leaders
            if (categories.find(category => category === 'activity')) {
                try {
                    activities = await Activity.find({ })
                        .populate('leaderUser')
                        .populate('creatorUser')
                        .lean();
                    res.render('questions', { 
                        questionCategories: null,
                        activities,
                    });
                } catch (e) {
                    console.log(e);
                    req.flash('error_msg', "We're sorry. Something went wrong.");
                    res.redirect('/');
                }
            } else {
                res.render('questions', { 
                    questionCategories: null,
                    activities,
                });
            }
        }
    }

    // Handle the user submitting part 2 of the form
    else {
        try {
            // Create a string of the email recipients
            let emailRecipients = "";
            
            // Find the admin users and add them to the email recipients
            const adminUsers = await User.find({ admin: true }).lean();

            adminUsers.forEach(admin => {
                if (admin.email.includes('@')) {
                    emailRecipients += `${admin.email},`;
                }
            });

            // If there are questions about activities, find the associated creators and leaders and add them to the email recipients
            if (activityInQuestion) {
                try {
                    const activity = await Activity.findOne({ _id: activityInQuestion })
                        .populate('leaderUser')
                        .populate('creatorUser')
                        .lean();

                    if (!activity.creatorUser.admin && activity.creatorUser.email.includes('@')) {
                        emailRecipients += `${activity.creatorUser.email},`;
                    }
                    if (activity.leaderUser && !activity.leaderUser.admin && (activity.creatorUser._id != activity.leaderUser._id) && activity.leaderUser.email.includes('@')) {
                        emailRecipients += `${activity.leaderUser.email},`;
                    }

                } catch (e) {
                    console.log(e);
                    req.flash('error_msg', "We're sorry. Something went wrong.");
                    res.redirect('/');
                }
            }
    
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
    }
});

// @desc    Show activities sign up page
// @route   GET /sign-up
router.get('/sign-up', async (req, res) => {
    try {
        const activities = await Activity.find({ status: 'published' })
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
    if (!name || !phone || !selectedActivities) {
        errors.push({ msg: 'Please fill in all fields (email is optional but strongly recommended). '});
    }

    // Make sure all submitted activities are valid
    if (selectedActivities) {
        // Make selectedActivities an array if only one activity was selected
        if (!Array.isArray(selectedActivities)) {
            selectedActivities = [ selectedActivities ];
        }

        selectedActivities.forEach(async activity => {
            try {
                if (!await Activity.findOne({ _id: activity, status: 'published' }).lean()) {
                    errors.push({ msg: 'Please submit valid activities. '});
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
            const activities = await Activity.find({ status: 'published' })
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
                            email: email ? email : `${name} (no email)`,
                            phone
                        };
                        await Activity.updateOne({ _id: activity }, { $push: { rsvps: newRsvp } });

                        req.flash('success_msg', 'You are successfully signed up!');
                        res.redirect('/');
                    } catch (e) {
                        console.log(e);
                        req.flash('error_msg', "We're sorry. Something went wrong.");
                        res.redirect('/');
                    }
                }
                // If the new RSVP has already signed up for this activity, redirect the user with an error
                else {
                    req.flash('error_msg', "A user with this email is already signed up for this activity!");
                    res.redirect(`/${activityId}/rsvps`);
                }
            } catch (e) {
                console.log(e);
                req.flash('error_msg', "We're sorry. Something went wrong.");
                res.redirect('/');
            }
        });
    }
});

module.exports = router;