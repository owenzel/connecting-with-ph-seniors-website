const express = require('express');
const router = express.Router();
const transporter = require('./../config/email');
const { activityEmail, fetchPublishedActivites, fetchAPublishedActivityById, errorRedirect } = require('../helpers/node-helpers');
const User = require('./../models/User');
const Activity = require('./../models/Activity');

const questionCategories = [{ text: 'A Specific Activity', value: 'activity' }, { text: 'Using the Website', value: 'website' }, { text: 'Something Else', value: 'other' }];

// @desc    Show landing page: all published activities
// @route   GET /
router.get('/', async (req, res) => {
    try {
        // Get all published activities
        const activities = await fetchPublishedActivites();
        
        // Render the home page with the published activities
        if (activities) {
            res.render('index', {
                activities
            });
        } else {
            errorRedirect(req, res, 'Fetch was unsuccessful.', '/questions');
        }
    } catch (e) {
        errorRedirect(req, res, e, '/questions');
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
    // Get submitted fields from the question form
    let { categoriesWereSubmitted, categories, name, email, phone, questions, activityInQuestion } = req.body;

    // Store any errors in validating the form submission
    let errors = [];
    
    // Handle the user submitting part 1 of the form
    if (categoriesWereSubmitted) {
        // Ensure the user selected at least one category
        if (!categories) {
            errors.push({ msg: 'Please select at least one question category. '})
        }
        
        // Ensure categories is an array
        if (!Array.isArray(categories)) {
            categories = [ categories ];
        }

        // If there are any errors, re-render the page with alerts to the user.
        if (errors.length > 0) {
            res.render('questions', {
                errors,
                questionCategories
            });
        }

        // If there are no errors, render the page with part 2 of the form
        else {
            let activities = null;
            // If the user has a question about a specific activity, get the activity leaders
            if (categories.find(category => category == 'activity')) {
                try {
                    // Get the published activities
                    const activities = await fetchPublishedActivites();

                    if (activities) {
                        // Render the questions page with the published activities
                        res.render('questions', { 
                            questionCategories: null,
                            activities,
                        });
                    } else {
                        errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
                    }
                } catch (e) {
                    errorRedirect(req, res, e, '/');
                }
            } 
            
            // If the user doesn't have a question about a specific activity, render the questions page without activities
            else {
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
            
            // Find the admin users and add them to the email recipients (if they have an email)
            const adminUsers = await User.find({ admin: true }).lean();
            adminUsers.forEach(admin => {
                if (admin.email.includes('@')) {
                    emailRecipients += `${admin.email},`;
                }
            });

            // If there are questions about activities, find the associated creators and leaders and add them to the email recipients (if they have an email)
            if (activityInQuestion) {
                try {
                    const activity = await fetchAPublishedActivityById(activityInQuestion);

                    if (activity) {
                        if (!activity.creatorUser.admin && activity.creatorUser.email.includes('@')) {
                            emailRecipients += `${activity.creatorUser.email},`;
                        }
                        if (activity.leaderUser && !activity.leaderUser.admin && (activity.creatorUser._id != activity.leaderUser._id) && activity.leaderUser.email.includes('@')) {
                            emailRecipients += `${activity.leaderUser.email},`;
                        }
                    } else {
                        errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
                    }

                } catch (e) {
                    errorRedirect(req, res, e, '/');
                }
            }
    
            //Create an email with the question(s)
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
    
            // Send the email with the questions
            transporter.sendMail(emailContent, (e, data) => {
                if (e) {
                    errorRedirect(req, res, e, '/');
                } else {
                    req.flash('success_msg', 'Your questions were successfully submitted!');
                    res.redirect('/');
                }
            });
        } catch (e) {
            errorRedirect(req, res, e, '/');
        }
    }
});

// @desc    Show activities sign up page
// @route   GET /sign-up
router.get('/sign-up', async (req, res) => {
    try {
        // Get all published activities
        const activities = await fetchPublishedActivites();

        if (activities) {
            // Render the sign up page with the published activities
            res.render('sign-up', {
                user: req.user,
                activities
            });
        } else {
            errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
        }
    } catch (e) {
        errorRedirect(req, res, e, '/');
    }
});

// @desc    Process activities sign-up form
// @route   POST /sign-up
router.post('/sign-up', async (req, res) => {
    // Get submitted fields from the sign up form
    let { name, email, phone, selectedActivities } = req.body;

    // Store any errors in validating the form submission
    let errors = [];

    // Check required fields
    if (!name || !phone || !selectedActivities) {
        errors.push({ msg: 'Please fill in all fields (email is optional but strongly recommended). '});
    }

    // Make sure all submitted activities are valid
    if (selectedActivities) {
        // Ensure selected activities is an arry
        if (!Array.isArray(selectedActivities)) {
            selectedActivities = [ selectedActivities ];
        }

        selectedActivities.forEach(async activity => {
            try {
                if (!await Activity.findOne({ _id: activity, status:{ $in:[ 'published', 'published and under review' ] } }).lean()) {
                    return errors.push({ msg: 'Please submit valid activities. '});
                }
            } catch (e) {
                errorRedirect(req, res, e, '/');
            }
        });
    }

    // If there are errors, re-render the page with the errors
    if (errors.length > 0) {
        try {
            const activities = await fetchPublishedActivites();
            
            if (activities) {
                res.render('sign-up', {
                    user: req.user,
                    activities,
                    errors
                });
            } else {
                errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
            }
        } catch (e) {
            errorRedirect(req, res, e, '/');
        }
    } 
    // If there are no errors, proceed with submitting the RSVPs
    else {
        try {
            // Update the activities with the RSVPs
            const signedUpActivities = await Activity.find({ _id:{ $in:selectedActivities } })
                .populate('leaderUser')
                .lean();
        
            signedUpActivities.forEach(async activity => {
                if (!activity.rsvps.find(rsvp => rsvp.email == email)) {
                    try {
                        const newRsvp = {
                            name,
                            email: email ? email : `${name} (no email)`,
                            phone
                        };
                        await Activity.updateOne({ _id: activity }, { $push: { rsvps: newRsvp } });
                    } catch (e) {
                        errorRedirect(req, res, e, '/');
                    }
                } else {
                    const errorMsg = `A user with this email is already signed up for ${activity.title}! Please try again!`;
                    errorRedirect(req, res, errorMsg, '/', errorMsg);
                }
            });

            // Clear the Sign Up Cart in the user's session
            req.session.signUps = [];

            // Send an email to the user with all the activities they signed up for
            const emailTitle = `Activities You Signed Up For On Connecting With Parma Heights Seniors - Virtual Activities`;
            const success = await activityEmail(emailTitle, req.user.email, signedUpActivities);

            if (success) {
                req.flash('success_msg', 'You are successfully signed up!');
                res.redirect('/');
            } else {
                errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
            }
        } catch (e) {
            errorRedirect(req, res, e, '/');
        }
    }
});

module.exports = router;