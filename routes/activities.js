const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');
const { formatDate } = require('../helpers/ejs-helpers');
const { websiteUrl, activityEmail, fetchActivites, fetchAnActivityById, fetchUsers, errorRedirect, successRedirect } = require('../helpers/node-helpers');
const transporter = require('./../config/email');
const User = require('./../models/User');
const Activity = require('../models/Activity');

// @desc    Show My Activities page
// @route   GET /activities/my-activities
router.get('/my-activities', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch the published activities
        const activities = await fetchActivites();

        // If the fetch was unsuccessful, redirect with an error
        if (!activities) return errorRedirect(req, res, 'Fetch was unsuccessful.', '/');

        // Parse the published activities for activities that the user created, is leading, is attending, and needs to review (if they're an admin)
        let activitiesCreated = [];
        let activitiesLeading = [];
        let activitiesAttending = [];
        let activitiesToReview = [];

        activities.forEach(activity => {
            // Check if the user is an admin and if the activity is under review (needing approval)
            if (req.user.admin && (activity.status == 'unpublished and under review' || activity.status == 'published and under review')) activitiesToReview.push(activity);

            // Check if the logged in user created this activity
            if (activity.creatorUser._id == req.user.id) activitiesCreated.push(activity);

            // Check if the logged in user is leading this activity
            if (activity.leaderUser && activity.leaderUser._id == req.user.id) activitiesLeading.push(activity);

            // Check if the logged in user RSVPd to this activity
            if (activity.rsvps.find(rsvp => rsvp.email == req.user.email)) activitiesAttending.push(activity);
        });

        // Render the my-activities page with various categories of activities
        return res.render('activities/my-activities', { user: req.user, activitiesCreated, activitiesLeading, activitiesAttending, activitiesToReview });
        
    } catch (e) {
        // If the fetch was unsuccessful, redirect with an error
        return errorRedirect(req, res, e, '/');
    }
});

// @desc    Send email of all published activities to the logged in user
// @route   POST /activities/email-activities
router.post('/email-activities', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch the published activities
        const activities = await fetchActivites(true);

        // If the fetch was unsuccessful, redirect with an error page
        if (!activities) return errorRedirect(req, res, 'Fetch was unsuccessful.', '/');

        // Create and send an email
        const emailTitle = `Upcoming Activities on Connecting With Parma Heights Seniors - Virtual Events as of ${formatDate(Date.now(), 'MMMM Do YYYY, h:mm a')}`;
        const success = await activityEmail(emailTitle, req.user.email, activities);

        // If there was an error sending the email, redirect with an error message
        if (!success) return errorRedirect(req, res, 'The email was not sent.', '/', "We're sorry. The email was not sent.");

        // If there was no error, redirect with a success message
        return successRedirect(req, res, 'The email with upcoming activities was successfully sent.', '/');
    } catch (e) {
        // If there was an error sending the email, redirect with an error message
        return errorRedirect(req, res, e, '/');
    }
});

// @desc    Show create activity page
// @route   GET /activities/create
router.get('/create', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch all users
        const users = await fetchUsers();

        // If the fetch was unsuccessful, redirect with an error page
        if (!users) return errorRedirect(req, res, 'Fetch was unsuccessful.', '/');

        // Render the create activities page
        return res.render('activities/create', { users });
    } catch (e) {
        // If the fetch was unsuccessful, redirect with an error
        return errorRedirect(req, res, e, '/');
    }
});

// @desc    Process create activity form
// @route   POST /activities/create
router.post('/create', ensureAuthenticated, async (req, res) => {
    // Get submitted fields from the create activity form
    const { title, date, time, leaderName, leaderUsername, body } = req.body;

    // Store any errors in validating the form submission
    let errors = [];

    // Check required fields
    if (!title || !date || !time || !leaderName || !body) errors.push({ msg: 'Please fill in all fields (Activity Leader Username is optional but strongly recommended if they have an account).' });
    
    // If a username for an activity leader was entered, find them
    let leaderUser = null;
    if (leaderUsername != "") {
        try {
            // Fetch a user with the entered username
            leaderUser = await User.findOne({ username: leaderUsername }).lean();

            // If a username was entered and an associated user cannot be found, send an error message
            if (!leaderUser) errors.push({ msg: 'The Activity Leader Username does not exist. Please select a valid leader name.' });
        } catch (e) {
            // If the fetch was unsuccessful, redirect with an error
            return errorRedirect(req, res, e, '/');
        }
    }

    // If there are errors, re-render the page with the errors and entered information passed in
    if (errors.length > 0) {
        try {
            // Fetch all users
            const users = await fetchUsers();

            // If the fetch was unsuccessful, redirect with an error
            if (!users) return errorRedirect(req, res, 'Fetch was unsuccessful.', '/');

            // If the fetch was successful, render the create activity page with the errors
            return res.render('activities/create', { errors, users });
            
        } catch (e) {
            // If the fetch was unsuccessful, redirect with an error
            return errorRedirect(req, res, e, '/');
        }
    }

    // If there are no errors, create and save the new activity (to be reviewed)
    const expirationDate = new Date(date);
    expirationDate.setDate(expirationDate.getDate() + 1);

    const newActivity = new Activity({
        title,
        date: new Date(`${date}T${time}`),
        leaderName,
        leaderUser: leaderUsername ? leaderUser._id : null,
        status: req.user.admin ? 'published' : 'unpublished and under review',
        body,
        creatorUser: req.user.id,
        expireAt: expirationDate,
    });

    newActivity.save()
        .then(activity => {
            // If the user who is submitting the activity is not admin, send an email to admin to alert them to review the activity. Otherwise, just send a success message that it has been published
            if (!req.user.admin) {
                // Potential TODO: Send email to ALL admin (not just Olivia)

                // Create the email
                const emailContent = {
                    from: `${process.env.EMAIL}`,
                    to: `${process.env.EMAIL_ADMIN}`,
                    subject: `Activity Submitted for Review on Connecting With Parma Heights Seniors - Virtual Events`,
                    html: `
                            <p>A new activity was submitted by ${req.user.name}. Log in to <a href="${websiteUrl}/activities/my-activities"> Connecting With Parma Heights Seniors - Virtual Activities website</a> to review and approve it for publication.</p>
                            <p>Website: ${websiteUrl}/activities/my-activities</p>
                        `
                };
            
                // Send the email
                transporter.sendMail(emailContent, (e, data) => {
                    // If there was an error sending the email, redirect with an error message
                    if (e) return errorRedirect(req, res, e, '/activities/my-activities', "We're sorry. Something went wrong. Please check the table below to see if your activity was submitted for review. If you do not see it, please try again.");

                    // If there wasn't an error sending the email, redirect the user with a success message
                    return successRedirect(req, res, 'The activity was successfully submitted for review.', '/activities/my-activities');
                });
            }
            // If the user submitting the activity is an admin, redirect the user with a success message
            return successRedirect(req, res, 'The activity was successfully published.', '/activities/my-activities');
        })
        // If there was an error, redirect the user with an error message
        .catch(e => {
            return errorRedirect(req, res, e, '/');
        });
});

// @desc    Show single activity page
// @route   GET /activities/:id
router.get('/:id', async (req, res) => {
    try {
        // Fetch the requested activity based on the id in the URL
        const activity = await fetchAnActivityById(req.params.id);
        
        // If the requested activity does not exist, redirect them and throw an error
        if (!activity) return errorRedirect(req, res, 'Fetch was unsuccessful.', '/', "This activity could not be found.");

        // If this is a published activity or it is not published but the user still has access, render a page displaying information about the activity
        if (activity.status == 'published' || activity.status == 'published and under review' || (activity.status == 'unpublished and under review' && (req.user.admin || req.user.id == activity.creatorUser._id || req.user.id == activity.leaderUser._id))) {
            return res.render('activities/show', { activity });
        }

        // If the user is attempting to view an activity under review that they don't have access to, redirect them and throw an error
        return errorRedirect(req, res, "The user does not have permission to view this unpublished activity.", '/', "You do not have permission to view this unpublished activity.");
        
    } catch (e) {
        // If the fetch was unsuccessful, redirect them with an error message
        return errorRedirect(req, res, e, '/', "This activity could not be found.");
    }
});

// @desc    Save signed up activity to session (for Sign Up Cart)
// @route   POST /activities/:id/sign-up
router.post('/:id/sign-up', async (req, res) => {
    try {
        // Fetch the requested activity based on the id in the URL
        const activity = await fetchAnActivityById(req.params.id);

        // If the requested activity does not exist, redirect them and throw an error
        if (!activity) return errorRedirect(req, res, 'Fetch was unsuccessful.', '/', "This activity could not be found.");

        // Create an object for the Activity Sign Up Cart
        const cartItem = { _id: activity._id, title: activity.title };

        // If the user's Activity Sign Up Cart in their session doesn't exist, create a cart with the requested activity
        if (!req.session.signUps) {
            req.session.signUps = [cartItem];

            // Redirect the user to the home page with a success message
            return successRedirect(req, res, "The activity was successfully added to your Sign Up Cart!", '/');
        }
        // If the user already has a Sign Up Cart in their session, add the requested activity to their cart
        else if (!req.session.signUps.find(activity => activity._id == cartItem._id)) {
            req.session.signUps.push(cartItem);

            // Redirect the user to the home page with a success message
            return successRedirect(req, res, "The activity was successfully added to your Sign Up Cart!", '/');
        }
        // If the user already has the requested activity in their session Sign Up cart, redirect them with an appropriate message
        else return successRedirect(req, res, "The activity is already in your Sign Up Cart!", '/');
    } catch (e) {
        // If the fetch was unsuccessful, redirect them with an error message
        return errorRedirect(req, res, e, '/', "This activity could not be found.");
    }
});

// @desc    Delete signed up activity from session (for Sign Up Cart)
// @route   DELETE /activities/:id/sign-up
router.delete('/:id/sign-up', async (req, res) => {
    // If the user's Activity Sign Up Cart in their session doesn't exist, redirect them with an error
    if (!req.session.signUps) return errorRedirect(req, res, "The user does not have a session and/or the signUps property of their session.", '/');
    
    // If the user has an activity in their session Activity Sign Up Cart, remove it
    const index = req.session.signUps.findIndex(signUp => req.params.id == signUp._id);
    if (index != -1) req.session.signUps.splice(index, 1);

    // Redirect them to the home page with a success message
    return successRedirect(req, res, "The activity was successfully removed from your Sign Up Cart!", '/');
});

// @desc    Show single activity's RSVPs
// @route   GET /activities/:id/rsvps
router.get('/:id/rsvps', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch the requested activity based on the id in the URL
        const activity = await fetchAnActivityById(req.params.id);

        // Fetch all users
        const users = await fetchUsers();
        
        // If the requested activity does not exist, redirect them and throw an error
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            return errorRedirect(req, res, errorMsg, '/', errorMsg);
        }
        
        // If the users fetch was unsuccessful, redirect them with an error message
        if (!users) return errorRedirect(req, res, "Error with fetching users.", '/');

        // If the user is an admin or has access to this activity, render a page with the list of RSVPs
        if (req.user.admin || activity.creatorUser == req.user.id || activity.leaderUser == req.user.id) return res.render('activities/rsvps', { activity, users });

        // If a user is attempting to view the RSVPs for an activity that do not have access to, redirect them with an error message
        return errorRedirect(req, res, "The user does not have permission to view this unpublished activity.", '/', "You do not have permission to view this unpublished activity.");
    } catch (e) {
        // If the fetch was unsuccessful, redirect them with an error message
        return errorRedirect(req, res, e, '/', "This activity could not be found.");
    }
});

// @desc    Update given activity's RSVPs
// @route   GET /activities/:id/rsvps
router.put('/:id/rsvps', ensureAuthenticated, async (req, res) => {
    // Get submitted fields from the create RSVP form
    let { name, email, phone } = req.body;

    // Store any errors in validating the form submission
    let errors = [];

    // Check required fields
    if (!name || !phone) errors.push({ msg: 'Please fill in all fields. '});

    // Make sure the selected activity was valid
    try {
        // Fetch the requested activity based on the id in the URL
        const activity = await fetchAnActivityById(req.params.id);

        // If the fetch was unsuccessful, redirect them with an error message
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            return errorRedirect(req, res, errorMsg, '/', errorMsg);
        }

        // If there are errors, re-render the page with the errors
        if (errors.length > 0) return res.render('activities/rsvps', { errors, activity, name, email, phone });

        // If there are no errors, proceed with updating the activity with the new RSVP
        const found = activity.rsvps.find(rsvp => rsvp.email == email);

        // If the new attempted RSVP hasn't already signed up for this activity, save a new rsvp to this activity
        if (!found) {
            try {
                // Create a new RSVP object
                const newRsvp = {
                    name,
                    email: email ? email : `${name} (no email)`,
                    phone
                };

                // Update the activity with the newly created RSVP object
                await Activity.updateOne({ _id: activity }, { $push: { rsvps: newRsvp } });
                
                // Redirect the user with a success message
                return successRedirect(req, res, 'This RSVP was successfully submitted!', '/activities/my-activities');
            } catch (e) {
                // If the update was unsuccessful, redirect them with an error message
                return errorRedirect(req, res, e, '/');
            }
        }
        // If the new RSVP has already signed up for this activity, redirect the user with an error
        const errorMsg = "A user with this email is already signed up for this activity!";
        return errorRedirect(req, res, errorMsg, '/activities/my-activities', errorMsg);
    } catch (e) {
        // If the fetch was unsuccessful, redirect them with an error message
        return errorRedirect(req, res, e, '/activities/my-activities');
    }
});

// @desc    Cancel RSVP to activity
// @route   PUT /activities/:id/cancel
router.delete('/:id/:userEmail/rsvp', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch the requested activity based on the id in the URL
        let activity = await fetchAnActivityById(req.params.id);

        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            return errorRedirect(req, res, errorMsg, '/', errorMsg);
        }

        // If the requested does exist, find this user's RSVP and change it to not going (if the RSVP exists)
        if (activity.rsvps.find(async rsvp => rsvp.email == req.user.email)) {
            try {
                // Update the RSVPs in the database
                await Activity.findOneAndUpdate({ "_id": req.params.id },
                    { $pull: { rsvps: { email: req.params.userEmail } } }
                );

                // If the RSVP was successfully canceled, redirect them with a success message
                return successRedirect(req, res, 'You have successfully canceled the RSVP.', '/activities/my-activities');
            } catch (e) {
                // If the update was unsuccessful, redirect them with an error message
                return errorRedirect(req, res, e, '/');
            }
        }
        // If the user was already RSVP'd to this activity, redirect them with an error message
        return errorRedirect(req, res, "The user was not RSVP'd to this activity.", '/', "You were not RSVP'd to this activity.");
    } catch (e) {
        // If the fetch was unsuccessful, redirect them with an error message
        return errorRedirect(req, res, e, '/activities/my-activities', "This activity could not be found.");
    }
});

// @desc    Process email RSVPs form
// @route   POST /activities/:id/email-rsvps
router.post('/:id/email-rsvps', ensureAuthenticated, async (req, res) => {
    // Get submitted fields from send message to RSVPs form
    let { subject, emailBody, rsvpEmails } = req.body;

    // Create a string to store the recipients of the email
    let emailRecipients = `${req.user.email},`;

    // Turn the comma-separated list of RSVPs into an array
    rsvpEmails = rsvpEmails.split(',');

    // Make sure emails are only being sent to RSVPs who actually have emails
    rsvpEmails.forEach(email => {
        if (email.includes('@')) emailRecipients += `${email},`;
    });
    
    // Create an email with the message submitted in the form, with the admin account CC'd
    const emailContent = {
        from: `${process.env.EMAIL}`,
        to: `${emailRecipients}`,
        cc: `${process.env.EMAIL_ADMIN}`,
        subject: `${subject}`,
        html: `
                <h3>Below is a message from ${req.user.name}, which was submitted through Connecting With Parma Heights Seniors - Virtual Activities website </h3>
                <p>${emailBody}</p>
            `
    };

    // Send the email
    transporter.sendMail(emailContent, (e, data) => {
        // If there was an error sending the email, redirect them with an error message
        if (e) return errorRedirect(req, res, e, '/', "We're sorry. Something went wrong. Your message may not have been sent.");
        
        // If there was no error with sending the email, redirect them with a success message
        return successRedirect(req, res, 'Your message was successfully sent!', '/activities/my-activities');
    });
});

// @desc    Edit activity page
// @route   GET /activities/:id/edit
router.get('/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch the requested activity given the id in the URL
        const activity = await fetchAnActivityById(req.params.id);
    
        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            return errorRedirect(req, res, errorMsg, '/', errorMsg);
        }
    
        // If the user is an admin or has access to this activity, render the edit page
        if (req.user.admin || ((activity.status == 'published' || activity.status == 'published and under review') && activity.creatorUser == req.user.id)) {
            return res.render('activities/edit', { activity });
        }

        // If a user is attempting to edit an activity that do not have access to, redirect them with an error message
        return errorRedirect(req, res, "The user does not have permission to edit this activity.", '/', "You do not have permission to edit this activity.");
    } catch (e) {
        // If the fetch was unsuccessful, redirect them
        return errorRedirect(req, res,e, '/');
    }
});

// @desc    Update activity
// @route   PUT /activities/:id
router.put('/:id', ensureAuthenticated, async (req, res) => {
    // Get submitted fields from the edit activity form
    const { title, body } = req.body;

    try {
        // Fetch the requested activity given the id in the URL
        let activity = await fetchAnActivityById(req.params.id);

        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            return errorRedirect(req, res, errorMsg, '/', errorMsg);
        }

        // If the user is an admin or has access to this activity, update it
        if (req.user.admin || activity.creatorUser == req.user.id) {
            activity = await Activity.findOneAndUpdate(
                { 
                    _id: req.params.id 
                },
                {
                    title: title,
                    body: body,
                    status: req.user.admin ? 'published' : 'published and under review'
                }, 
                {
                    new: true,
                    runValidators: true
                }
            );

            // Potential TODO: Send email to ALL admin (not just Olivia)

            // Create an email to send to admin, alerting them that an activity was edited and needs to be reviewed
            const emailContent = {
                from: `${process.env.EMAIL}`,
                to: `${process.env.EMAIL_ADMIN}`,
                subject: `Activity Edited on Connecting With Parma Heights Seniors - Virtual Events`,
                html: `
                        <p>A published activity called ${req.body.title} was edited by ${req.user.name}. Log in to <a href="${websiteUrl}/activities/${req.params.id}"> Connecting With Parma Heights Seniors - Virtual Activities website</a> to view it.</p>
                        <p>Website: ${websiteUrl}/activities/${req.params.id}</p>
                    `
            };
        
            // Send the email
            transporter.sendMail(emailContent, (e, data) => {
                // If there was an error sending the email, log it to the console
                if (e) console.log(e);

                // Redirect to the my activities page with a success message
                return successRedirect(req, res, 'The activity was successfully edited.', '/activities/my-activities');
            });

            // Redirect to the my activities page with a success message
            return successRedirect(req, res, 'The activity was successfully edited.', '/activities/my-activities');
        } 

        // If a user is attempting to edit an activity that do not have access to, redirect them with an error message
        return errorRedirect(req, res, "The user does not have permission to edit this activity.", '/', "You do not have permission to edit this activity.");
    } catch (e) {
        // If the fetch or update was unsuccessful, redirect them with an error message
        return errorRedirect(req, res, e, '/activities/my-activities');
    }
});

// @desc    Approve activity for publication (by admin)
// @route   POST /activities/:id/approve
router.post('/:id/approve', ensureAuthenticated, async (req, res) => {
    // If the logged in user is not an admin, redirect them with an error
    if (!req.user.admin) return errorRedirect(req, res, "The user does not have permission to publish this activity.", '/', "You do not have permission to publish this activity.");
    
    // If the logged in user is an admin, proceed to try to publish the activity
    try {
        // Publish the activity by updating the status in the database
        const activity = await Activity.findOneAndUpdate({ _id: req.params.id }, { status: 'published' }, {
            new: true,
            runValidators: true
        }).populate('leaderUser').populate('creatorUser').lean();
        
        // Potential TODO: Send email to ALL admin (not just Olivia)

        // Create a string of email recipients: admin and the creator user (if they have an email)
        let emailRecipients = `${process.env.EMAIL_ADMIN},`;
        if (activity.creatorUser.email && activity.creatorUser.email.includes('@')) emailRecipients += `${activity.creatorUser.email},`;
        
        // Create an email to send to admin and activity creator, alerting them that the activity was approved for publication.
        const emailContent = {
            from: `${process.env.EMAIL}`,
            to: `${emailRecipients}`,
            subject: `Activity Approved on Connecting With Parma Heights Seniors - Virtual Events`,
            html: `
                    <p>Congratulations! Your new submission or your edits for the activity called "${activity.title}" were approved for publication on Connecting With Parma Heights Seniors - Virtual Events. Other users may view it and sign up. Log in to <a href="${websiteUrl}/activities/${req.params.id}"> Connecting With Parma Heights Seniors - Virtual Activities website</a> to view it.</p>
                    <p>Website: ${websiteUrl}/activities/${req.params.id}</p>
                `
        };
    
        // Send the email
        transporter.sendMail(emailContent, (e, data) => {
            // If there was an erorr sending the email, log it to the console
            if (e) console.log(e);

            // Redirect them to the my activities page with a success message
            return successRedirect(req, res, 'The activity was successfully published.', '/activities/my-activities');
        });
    } catch (e) {
        // If the fetch was unsuccessful, redirect them with an error message
        return errorRedirect(req, res, e, '/');
    }
});

// @desc    Reject activity for publication (by admin)
// @route   POST /activities/:id/reject
router.post('/:id/reject', ensureAuthenticated, async (req, res) => {
    // If the logged in user was not an admin, redirect the user with an error message, alerting them that they don't have permission
    if (!req.user.admin) return errorRedirect(req, res, "The user does not have permission to reject this activity for publication.", '/', "You do not have permission to reject this activity for publication.");
    
    // If this is an admin, delete the activity and send an email to the creator
    try {
        // Fetch the requested activity based on the id in the URL
        const activity = await fetchAnActivityById(req.params.id);
        
        // If the requested activity doesn't exist, redirect them with an error
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            return errorRedirect(req, res, errorMsg, '/activities/my-activities', errorMsg);
        }

        // If the requested activity exists, delete the activity and send an email
        try {
            // Delete the requested activity
            await Activity.deleteOne({ _id: req.params.id });

            // Potential TODO: Send email to ALL admin (not just Olivia)

            // Create a string of email recipients: admin and creator user (if they have an email)
            let emailRecipients = `${process.env.EMAIL_ADMIN},`;
            if (activity.creatorUser.email && activity.creatorUser.email.includes('@')) emailRecipients += `${activity.creatorUser.email},`;
            
            // Create an email to send to activity creator that the activity (with the activity details) was rejected with explanation. CC admin.
            const emailContent = {
                from: `${process.env.EMAIL_ADMIN}`,
                to: `${emailRecipients}`,
                subject: `Activity Rejected on Connecting With Parma Heights Seniors - Virtual Events`,
                html: `
                        <p>Apologies! Your new submission or your edits for the activity called "${activity.title}" was rejected for publication on Connecting With Parma Heights Seniors - Virtual Events. Please review the feedback below. Reply to this email if you have any questions.</p>
                        <br>
                        <h3>Submitted Activity Details:</h3>
                        <p><b>Title:</b> ${activity.title}</p>
                        <p><b>Date: </b> ${formatDate(activity.date, 'MMMM Do YYYY, h:mm a')}</p>
                        <p><b>Leader Name:</b> ${activity.leaderUser ? activity.leaderUser.name : activity.leaderName}</p>
                        <p><b>Description:</b> ${activity.body}</p>
                        <h3>Feedback/Reasons for the Rejection:</h3>
                        <p>${req.body.feedback}</p>
                    `
            };
        
            // Send the email
            transporter.sendMail(emailContent, (e, data) => {
                // If there was an error sending the email, log it to the console
                if (e) console.log(e);

                // Redirect them to the my-activities page with a success message
                return successRedirect(req, res, 'The activity was successfully rejected for publication.', '/activities/my-activities');
            });
        } catch (e) {
            // If there was an error deleting the activity, redirect them with an error message
            return errorRedirect(req, res, e, '/activities/my-activities');
        }
    } catch (e) {
        // If there was an error fetching the activity, redirect them with an error message
        return errorRedirect(req, res, e, '/activities/my-activities');
    }
});

// @desc    Delete activity
// @route   DELETE /activities/:id
router.delete('/:id', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch the requested activity given the id in the URL
        let activity = await fetchAnActivityById(req.params.id);

        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            return errorRedirect(req, res, errorMsg, '/', errorMsg);
        }

        // If the user is an admin or has access to this activity, delete it
        if (req.user.admin || activity.creatorUser == req.user.id) {
            // Delete the requested activity based on the id in the URL
            await Activity.deleteOne({ _id: req.params.id });

            // Redirect them to the my-activities page with a success message
            return successRedirect(req, res, 'The activity was successfully deleted.', '/activities/my-activities');
        }
    } catch (e) {
        // If there was an error deleting the activity, redirect them with an error
        return errorRedirect(req, res, e, '/', "We're sorry. The activity may not have been deleted.");
    }
});

module.exports = router;