const express = require('express');
const router = express.Router();
const transporter = require('./../config/email');
const { activityEmail, fetchPublishedActivites, fetchAPublishedActivityById, errorRedirect, successRedirect } = require('../helpers/node-helpers');
const User = require('./../models/User');
const Activity = require('./../models/Activity');

const questionCategories = [
    { text: 'A Specific Activity', value: 'activity' },
    { text: 'Using the Website', value: 'website' },
    { text: 'Something Else', value: 'other' }
];

// @desc    Show landing page: all published activities
// @route   GET /
router.get('/', async (req, res) => {
    try {
        // Get all published activities
        const activities = await fetchPublishedActivites();
        
        // If the fetch was unsuccessful, redirect with an error page
        if (!activities) errorRedirect(req, res, 'Fetch was unsuccessful.', '/questions');

        // Render the home page with the published activities
        res.render('index', { activities });
    }
    catch (e) {
        // If the fetch was unsuccessful, redirect with an error page
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
        if (!categories) errors.push({ msg: 'Please select at least one question category. '})
        
        // Ensure categories is an array
        if (!Array.isArray(categories)) categories = [ categories ];

        // If there are any errors, re-render the page with alerts to the user.
        if (errors.length > 0) res.render('questions', { errors, questionCategories });

        // If there are no errors, render the page with part 2 of the form
        let activities = null;

        // If the user has a question about a specific activity, get the activity leaders
        if (categories.find(category => category == 'activity')) {
            try {
                // Get the published activities
                const activities = await fetchPublishedActivites();

                // If the fetch was unsuccessful, redirect with an error page
                if (!activities) errorRedirect(req, res, 'Fetch was unsuccessful.', '/');

                // Render the questions page with the published activities
                res.render('questions', { questionCategories: null, activities });

            } catch (e) {
                // If the fetch was unsuccessful, redirect with an error page
                errorRedirect(req, res, e, '/');
            }
        } 
        // If the user doesn't have a question about a specific activity, render the questions page without activities
        else res.render('questions', { questionCategories: null, activities });
    }
    // Handle the user submitting part 2 of the form
    else {
        try {
            // Create a string of the email recipients
            let emailRecipients = "";
            
            // Fetch the admin users and add them to the email recipients (if they have an email)
            const adminUsers = await User.find({ admin: true }).lean();
            adminUsers.forEach(admin => {
                if (admin.email.includes('@')) emailRecipients += `${admin.email},`;
            });

            // If there are questions about activities, proceed with sending an email to the appropriate parties
            if (activityInQuestion) {
                try {
                    // Fetch the activity that the user has questions about
                    const activity = await fetchAPublishedActivityById(activityInQuestion);

                    // If the fetch was unsuccessful, redirect with an error page
                    if (!activity) errorRedirect(req, res, 'Fetch was unsuccessful.', '/');

                    // Find the associated creators and leaders and add them to the email recipients (if they have an email)
                    if (!activity.creatorUser.admin && activity.creatorUser.email.includes('@')) {
                        emailRecipients += `${activity.creatorUser.email},`;
                    }
                    if (activity.leaderUser && !activity.leaderUser.admin && (activity.creatorUser._id != activity.leaderUser._id) && activity.leaderUser.email.includes('@')) {
                        emailRecipients += `${activity.leaderUser.email},`;
                    }
                } catch (e) {
                    // If the fetch was unsuccessful, redirect with an error page
                    errorRedirect(req, res, e, '/', "We're sorry. Your questions were not received. Please try again.");
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
                // If there was an error sending the email, redirect with an error message
                if (e) errorRedirect(req, res, e, '/', "We're sorry. Your questions were not received. Please try again.");
                
                // If there wasn't an error sending the email, redirect the user with a success message
                successRedirect(req, res, 'Your questions were successfully submitted!', '/');
            });
        } catch (e) {
            // If the fetch was unsuccessful, redirect with an error page
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

        // If the fetch was unsuccessful, redirect with an error page
        if (!activities) errorRedirect(req, res, 'Fetch was unsuccessful.', '/');

        // Render the sign up page with the published activities
        res.render('sign-up', { user: req.user, activities });
    } catch (e) {
        // If the fetch was unsuccessful, redirect with an error page
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
    if (!name || !phone || !selectedActivities) errors.push({ msg: 'Please fill in all fields (email is optional but strongly recommended). '});

    // Make sure all submitted activities are valid
    if (selectedActivities) {
        // Ensure selected activities is an arry
        if (!Array.isArray(selectedActivities)) selectedActivities = [ selectedActivities ];

        // Ensure only valid activities were submitted
        selectedActivities.forEach(async activity => {
            try {
                if (!fetchAPublishedActivityById(activity)) return errors.push({ msg: 'Please submit valid activities. '});
            } catch (e) {
                // If the fetch was unsuccessful, redirect with an error page
                errorRedirect(req, res, e, '/');
            }
        });
    }

    // If there are errors, re-render the page with the errors
    if (errors.length > 0) {
        try {
            // Fetch the published activities
            const activities = await fetchPublishedActivites();
            
            // If the fetch was unsuccessful, redirect with an error page
            if (!activities) errorRedirect(req, res, 'Fetch was unsuccessful.', '/');

            // Re-render the sign up page with the errors
            res.render('sign-up', { user: req.user, activities, errors });
        } catch (e) {
            // If the fetch was unsuccessful, redirect with an error page
            errorRedirect(req, res, e, '/');
        }
    } 
    // If there are no errors, proceed with submitting the RSVPs
    else {
        try {
            // Update the activities with the RSVPs
            const signedUpActivities = await Activity.find({ _id:{ $in:selectedActivities } }).populate('leaderUser').lean();
        
            // Create RSVPs for all of the submitted activities
            signedUpActivities.forEach(async activity => {
                // If the user is signed up for one of the activities they submitted in the sign up, redirect them with an error
                if (activity.rsvps.find(rsvp => rsvp.email == email)) {
                    const errorMsg = `A user with this email is already signed up for ${activity.title}! Please try again!`;
                    errorRedirect(req, res, errorMsg, '/', errorMsg);
                }

                // If the user is not signed up for the given activity, create an RSVP and save it to the database
                try {
                    const newRsvp = {
                        name,
                        email: email ? email : `${name} (no email)`,
                        phone
                    };
                    await Activity.updateOne({ _id: activity }, { $push: { rsvps: newRsvp } });
                } catch (e) {
                    // If there was an error updating the RSVPs, redirect with an error message
                    errorRedirect(req, res, e, '/');
                }
            });

            // Clear the Sign Up Cart in the user's session
            req.session.signUps = [];

            // Send an email to the user with all the activities they signed up for
            const emailTitle = `Activities You Signed Up For On Connecting With Parma Heights Seniors - Virtual Activities`;
            await activityEmail(emailTitle, req.user.email, signedUpActivities);

            // Redirect with a success message
            successRedirect(req, res, 'You are successfully signed up!', '/');
        } catch (e) {
            errorRedirect(req, res, e, '/');
        }
    }
});

module.exports = router;