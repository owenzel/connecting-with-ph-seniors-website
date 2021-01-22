const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');
const { formatDate } = require('../helpers/ejs-helpers');
const { activityEmail, fetchPublishedActivites, fetchAPublishedActivityById, fetchUsers, errorRedirect } = require('../helpers/node-helpers');
const transporter = require('./../config/email');

const User = require('./../models/User');
const Activity = require('../models/Activity');

// @desc    Show My Activities page
// @route   GET /activities/my-activities
router.get('/my-activities', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch the published activities
        const activities = await fetchPublishedActivites();

        if (!activities) {
            errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
        }

        let activitiesCreated = [];
        let activitiesLeading = [];
        let activitiesAttending = [];
        let activitiesToReview = [];

        activities.forEach(activity => {
            // Check if the user is an admin and if the activity is under review (needing approval)
            if (req.user.admin && (activity.status == 'unpublished and under review' || activity.status == 'published and under review')) {
                activitiesToReview.push(activity);
            }

            // Check if the logged in user created this activity
            if (activity.creatorUser._id == req.user.id) {
                activitiesCreated.push(activity);
            }

            // Check if the logged in user is leading this activity
            if (activity.leaderUser && activity.leaderUser._id == req.user.id) {
                activitiesLeading.push(activity);
            }

            // Check if the logged in user RSVPd to this activity
            if (activity.rsvps.find(rsvp => rsvp.email == req.user.email)) {
                activitiesAttending.push(activity);
            }
        });

        res.render('activities/my-activities', {
            user: req.user,
            activitiesCreated,
            activitiesLeading,
            activitiesAttending,
            activitiesToReview
        });
        
    } catch (e) {
        errorRedirect(req, res, e, '/');
    }
});

// @desc    Send email of all activities to the logged in user
// @route   POST /activities/email-activities
router.post('/email-activities', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch the published activities
        const activities = await fetchPublishedActivites();

        if (!activities) {
            errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
        }

        const emailTitle = `Upcoming Activities on Connecting With Parma Heights Seniors - Virtual Events as of ${formatDate(Date.now(), 'MMMM Do YYYY, h:mm a')}`;

        const success = await activityEmail(emailTitle, req.user.email, activities);

        if (success) {
            req.flash('success_msg', 'The email with upcoming activities was successfully sent.');
            res.redirect('/');
        } else {
            errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
        }
    } catch (e) {
        errorRedirect(req, res, e, '/');
    }
});

// @desc    Show create activity page
// @route   GET /activities/create
router.get('/create', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch all users
        const users = await fetchUsers();
        if (!user) {
            errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
        }

        res.render('activities/create', { 
            users 
        });
    } catch (e) {
        errorRedirect(req, res, e, '/');
    }
});

// @desc    Process create activity form
// @route   POST /activities/create
router.post('/create', ensureAuthenticated, async (req, res) => {
    const { title, date, time, leaderName, leaderUsername, body } = req.body;
    let errors = [];

    // Check required fields
    if (!title || !date || !time || !leaderName || !body) {
        errors.push({ msg: 'Please fill in all fields (Activity Leader Username is optional but strongly recommended if they have an account).' });
    }
    
    // If a username for an activity leader was entered, find them
    let leaderUser = null;
    
    if (leaderUsername != "") {
        try {
            leaderUser = await User.findOne({ username: leaderUsername }).lean();

            if (!leaderUser) {
                errors.push({ msg: 'The Activity Leader Username does not exist. Please select a valid leader name.' });
            }
        } catch (e) {
            errorRedirect(req, res, e, '/');
        }
    }

    // If there are errors, re-render the page with the errors and entered information passed in
    if (errors.length > 0) {
        try {
            const users = await fetchUsers();
            if (user) {
                res.render('activities/create', {
                    errors,
                    users 
                });
            } else {
                errorRedirect(req, res, 'Fetch was unsuccessful.', '/');
            }
        } catch (e) {
            errorRedirect(req, res, e, '/');
        }
    } else { // Validation passed
        // Create and save the new activity (to be reviewed)
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
                    const emailContent = {
                        from: `${process.env.EMAIL}`,
                        to: `${process.env.EMAIL_ADMIN}`,
                        subject: `Activity Submitted for Review on Connecting With Parma Heights Seniors - Virtual Events`,
                        html: `
                                <p>A new activity was submitted by ${req.user.name}. Log in to <a href="${process.env.WEBSITE}/activities/my-activities"> Connecting With Parma Heights Seniors - Virtual Activities website</a> to review and approve it for publication.</p>
                                <p>Website: ${process.env.WEBSITE}/activities/my-activities</p>
                            `
                    };
                
                    transporter.sendMail(emailContent, (e, data) => {
                        if (e) {
                            errorRedirect(req, res, e, '/activities/my-activities', "We're sorry. Something went wrong. Please check the table below to see if your activity was submitted for review. If you do not see it, please try again.");
                        } else {
                            // Redirect to the my activities page with a success message
                            req.flash('success_msg', 'The activity was successfully submitted for review.');
                            res.redirect('/activities/my-activities');
                        }
                    });
                } else {
                    // Redirect to the my activities page with a success message
                    req.flash('success_msg', 'The activity was successfully published.');
                    res.redirect('/activities/my-activities');
                }
            })
            .catch(e => {
                errorRedirect(req, res, e, '/');
            });
    }
});

// @desc    Show single activity page
// @route   GET /activities/:id
router.get('/:id', async (req, res) => {
    try {
        const activity = await fetchAPublishedActivityById(req.params.id);
        
        // If the requested activity does not exist, redirect them and throw an error
        if (!activity) {
            errorRedirect(req, res, 'Fetch was unsuccessful.', '/', "This activity could not be found.");
        }

        // If this is a published activity or it is not published but the user still has access, render a page displaying information about the activity
        if (activity.status == 'published' || activity.status == 'published and under review' || (activity.status == 'unpublished and under review' && (req.user.admin || req.user.id == activity.creatorUser._id || req.user.id == activity.leaderUser._id))) {
            res.render('activities/show', {
                activity
            });
        // If the user is attempting to view an activity under review that they don't have access to, redirect them and throw an error
        } else {
            errorRedirect(req, res, "The user does not have permission to view this unpublished activity.", '/', "You do not have permission to view this unpublished activity.");
        }

        // If the requested activity does exist, render a page with the activity information
        
    } catch (e) {
        errorRedirect(req, res, e, '/', "This activity could not be found.");
    }
});

// @desc    Save signed up activity to session (for Sign Up Cart)
// @route   POST /activities/:id/sign-up
router.post('/:id/sign-up', async (req, res) => {
    try {
        const activity = await fetchAPublishedActivityById(req.params.id);

        // If the requested activity does not exist, redirect them and throw an error
        if (!activity) {
            errorRedirect(req, res, 'Fetch was unsuccessful.', '/', "This activity could not be found.");
        }

        const cartItem = { _id: activity._id, title: activity.title };

        if (!req.session.signUps) {
            req.session.signUps = [cartItem];

            req.flash('success_msg', "The activity was successfully added to your Sign Up Cart!");
            res.redirect('/');
        } else if (!req.session.signUps.find(activity => activity._id == cartItem._id)) {
            req.session.signUps.push(cartItem);

            req.flash('success_msg', "The activity was successfully added to your Sign Up Cart!");
            res.redirect('/');
        } else {
            req.flash('success_msg', "The activity is already in your Sign Up Cart!");
            res.redirect('/');
        }
        
    } catch (e) {
        errorRedirect(req, res, e, '/', "This activity could not be found.");
    }
});

// @desc    Delete signed up activity from session (for Sign Up Cart)
// @route   DELETE /activities/:id/sign-up
router.delete('/:id/sign-up', async (req, res) => {
    if (req.session.signUps) {
        const index = req.session.signUps.findIndex(signUp => req.params.id == signUp._id);
        if (index != -1) {
            req.session.signUps.splice(index, 1);
        }

        req.flash('success_msg', "The activity was successfully removed from your Sign Up Cart!");
        res.redirect('/');
    } else {
        errorRedirect(req, res, "The user does not have a session and/or the signUps property of their session.", '/');
    }
});

// @desc    Show single activity's RSVPs
// @route   GET /activities/:id/rsvps
router.get('/:id/rsvps', ensureAuthenticated, async (req, res) => {
    try {
        const activity = await fetchAPublishedActivityById(req.params.id);
        const users = await fetchUsers();
        
        // If the requested activity does not exist, redirect them and throw an error
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            errorRedirect(req, res, errorMsg, '/', errorMsg);
        } else if (!users) {
            errorRedirect(req, res, "Error with fetching users.", '/');
        }

        // If the user is an admin or has access to this activity, render a page with the list of RSVPs
        if (req.user.admin || activity.creatorUser == req.user.id || activity.leaderUser == req.user.id) {
            res.render('activities/rsvps', {
                activity,
                users
            });
        // If a user is attempting to view the RSVPs for an activity that do not have access to, redirect them with an error message
        } else {
            errorRedirect(req, res, "The user does not have permission to view this unpublished activity.", '/', "You do not have permission to view this unpublished activity.");
        }
    } catch (e) {
        errorRedirect(req, res, e, '/', "This activity could not be found.");
    }
});

// @desc    Update given activity's RSVPs
// @route   GET /activities/:id/rsvps
router.put('/:id/rsvps', ensureAuthenticated, async (req, res) => {
    let { name, email, phone } = req.body;
    let errors = [];

    // Check required fields
    if (!name || !phone) {
        errors.push({ msg: 'Please fill in all fields. '});
    }

    // Make sure the selected activity was valid
    try {
        const activity = await fetchAPublishedActivityById(req.params.id);

        if (!activity) {
            const errorMsg = "This activity could not be found.";
            errorRedirect(req, res, errorMsg, '/', errorMsg);
        }

        // If there are errors, re-render the page with the errors
        if (errors.length > 0) {
            res.render('activities/rsvps', {
                errors,
                activity,
                name,
                email,
                phone
            });
        } else { // Validation passed
            // Update the activity with the new RSVP
            const found = activity.rsvps.find(rsvp => rsvp.email == email);

            // If the new attempted RSVP hasn't already signed up for this activity, save a new rsvp to this activity
            if (!found) {
                try {
                    const newRsvp = {
                        name,
                        email: email ? email : `${name} (no email)`,
                        phone
                    };
                    await Activity.updateOne({ _id: activity }, { $push: { rsvps: newRsvp } });
                    
                    req.flash('success_msg', 'This RSVP was successfully submitted!');
                    res.redirect('/activities/my-activities');
                } catch (e) {
                    errorRedirect(req, res, e, '/');
                }
            }
            // If the new RSVP has already signed up for this activity, redirect the user with an error
            else {
                const errorMsg = "A user with this email is already signed up for this activity!";
                errorRedirect(req, res, errorMsg, '/activities/my-activities', errorMsg);
            }
        }
    } catch (e) {
        errorRedirect(req, res, e, '/activities/my-activities');
    }
});

// @desc    Cancel RSVP to activity
// @route   PUT /activities/:id/cancel
router.delete('/:id/:userEmail/rsvp', ensureAuthenticated, async (req, res) => {
    try {
        let activity = await fetchAPublishedActivityById(req.params.id);

        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            errorRedirect(req, res, errorMsg, '/', errorMsg);
        }

        // If the requested does exist, find this user's RSVP and change it to not going (if the RSVP exists)
        if (activity.rsvps.find(async rsvp => rsvp.email == req.user.email)) {
            try {
                await Activity.findOneAndUpdate({ "_id": req.params.id },
                    { $pull: { rsvps: { email: req.params.userEmail } } }
                );

                // If the RSVP was successfully canceled, redirect them with a success message
                req.flash('success_msg', 'You have successfully canceled the RSVP.');
                res.redirect('/activities/my-activities');
            } catch (e) {
                errorRedirect(req, res, e, '/');
            }
        } else {
            errorRedirect(req, res, "The user was not RSVP'd to this activity.", '/', "You were not RSVP'd to this activity.");
        }
    } catch (e) {
        errorRedirect(req, res, e, '/activities/my-activities', "This activity could not be found.");
    }
});

// @desc    Process email RSVPs form
// @route   POST /activities/:id/email-rsvps
router.post('/:id/email-rsvps', ensureAuthenticated, async (req, res) => {
    let { subject, emailBody, rsvpEmails } = req.body;

    //Create and send an email to the RSVPs and message author, with the admin account CC'd
    let emailRecipients = `${req.user.email},`;

    rsvpEmails = rsvpEmails.split(','); // turn the comma-separated list of RSVPs into an array

    rsvpEmails.forEach(email => {
        if (email.includes('@')) {
            emailRecipients += `${email},`;
        }
    });
    
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

    transporter.sendMail(emailContent, (e, data) => {
        if (e) {
            errorRedirect(req, res, e, '/', "We're sorry. Something went wrong. Your message may not have been sent.");
        } else {
            req.flash('success_msg', 'Your message was successfully sent!');
            res.redirect('/activities/my-activities');
        }
    });
});

// @desc    Edit activity page
// @route   GET /activities/edit/:id
router.get('/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
        const activity = await fetchAPublishedActivityById(req.params.id);
    
        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            errorRedirect(req, res, errorMsg, '/', errorMsg);
        }
    
        // If the user is an admin or has access to this activity, render the edit page
        if (req.user.admin || ((activity.status == 'published' || activity.status == 'published and under review') && activity.creatorUser == req.user.id)) {
            res.render('activities/edit', { 
                activity,
            });
        // If a user is attempting to edit an activity that do not have access to, redirect them with an error message
        } else {
            errorRedirect(req, res, "The user does not have permission to edit this activity.", '/', "You do not have permission to edit this activity.");
        }
    } catch (e) {
        errorRedirect(req, res,e, '/');
    }
    
});

// @desc    Update activity
// @route   PUT /activities/:id
router.put('/:id', ensureAuthenticated, async (req, res) => {
    const { title, body } = req.body;

    try {
        let activity = await fetchAPublishedActivityById(req.params.id);

        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            const errorMsg = "This activity could not be found.";
            errorRedirect(req, res, errorMsg, '/', errorMsg);
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
            const emailContent = {
                from: `${process.env.EMAIL}`,
                to: `${process.env.EMAIL_ADMIN}`,
                subject: `Activity Edited on Connecting With Parma Heights Seniors - Virtual Events`,
                html: `
                        <p>A published activity called ${req.body.title} was edited by ${req.user.name}. Log in to <a href="${process.env.WEBSITE}/activities/${req.params.id}"> Connecting With Parma Heights Seniors - Virtual Activities website</a> to view it.</p>
                        <p>Website: ${process.env.WEBSITE}/activities/${req.params.id}</p>
                    `
            };
        
            transporter.sendMail(emailContent, (e, data) => {
                if (e) {
                    console.log(e);
                }
                // Redirect to the my activities page with a success message
                req.flash('success_msg', 'The activity was successfully edited.');
                res.redirect('/activities/my-activities');
            });

        // If a user is attempting to edit an activity that do not have access to, redirect them with an error message
        } else {
            errorRedirect(req, res, "The user does not have permission to edit this activity.", '/', "You do not have permission to edit this activity.");
        }
    } catch (e) {
        errorRedirect(req, res, e, '/activities/my-activities');
    }
});

// @desc    Approve activity for publication (by admin)
// @route   POST /activities/:id/approve
router.post('/:id/approve', ensureAuthenticated, async (req, res) => {
    // Publish the activity if this is an admin. Otherwise, redirect and render an error
    if (req.user.admin) {
        try {
            const activity = await Activity.findOneAndUpdate({ _id: req.params.id }, { status: 'published' }, {
                new: true,
                runValidators: true
            }).populate('leaderUser').populate('creatorUser').lean();

            // Send email to admin and activity creator that the activity was approved for publication.
            // Potential TODO: Send email to ALL admin (not just Olivia)
            let emailRecipients = `${process.env.EMAIL_ADMIN},`;

            if (activity.creatorUser.email) {
                emailRecipients += `${activity.creatorUser.email},`;
            }
            
            const emailContent = {
                from: `${process.env.EMAIL}`,
                to: `${emailRecipients}`,
                subject: `Activity Approved on Connecting With Parma Heights Seniors - Virtual Events`,
                html: `
                        <p>Congratulations! Your new submission or your edits for the activity called "${activity.title}" were approved for publication on Connecting With Parma Heights Seniors - Virtual Events. Other users may view it and sign up. Log in to <a href="${process.env.WEBSITE}/activities/${req.params.id}"> Connecting With Parma Heights Seniors - Virtual Activities website</a> to view it.</p>
                        <p>Website: ${process.env.WEBSITE}/activities/${req.params.id}</p>
                    `
            };
        
            transporter.sendMail(emailContent, (e, data) => {
                if (e) {
                    console.log(e);
                }
                // Redirect to the my activities page with a success message
                req.flash('success_msg', 'The activity was successfully published.');
                res.redirect('/activities/my-activities');
            });
        } catch (e) {
            errorRedirect(req, res, e, '/');
        }
    } else {
        errorRedirect(req, res, "The user does not have permission to publish this activity.", '/', "You do not have permission to publish this activity.");
    }
});

// @desc    Reject activity for publication (by admin)
// @route   POST /activities/:id/reject
router.post('/:id/reject', ensureAuthenticated, async (req, res) => {
    // Delete the activity and send an email to the creator if this is an admin. Otherwise, redirect and render an error
    if (req.user.admin) {
        try {
            // Find the activity to delete
            const activity = await fetchAPublishedActivityById(req.params.id);
            
            // Ensure the activity to delete exists; otherwise redirect with an error
            if (!activity) {
                const errorMsg = "This activity could not be found.";
                errorRedirect(req, res, errorMsg, '/activities/my-activities', errorMsg);
            } else {
                // Delete the activity and send an email
                try {
                    await Activity.deleteOne({ _id: req.params.id });
                    // Send email to activity creator that the activity (with the activity details) was rejected with explanation. CC admin.
                    // Potential TODO: Send email to ALL admin (not just Olivia)
                    let emailRecipients = `${process.env.EMAIL_ADMIN},`;

                    if (activity.creatorUser.email) {
                        emailRecipients += `${activity.creatorUser.email},`;
                    }
                    
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
                
                    transporter.sendMail(emailContent, (e, data) => {
                        if (e) {
                            console.log(e);
                        }
                        // Redirect to the my activities page with a success message
                        req.flash('success_msg', 'The activity was successfully rejected for publication.');
                        res.redirect('/activities/my-activities');
                    });
                } catch (e) {
                    errorRedirect(req, res, e, '/activities/my-activities');
                }
            }
        } catch (e) {
            errorRedirect(req, res, e, '/activities/my-activities');
        }
    } else {
        errorRedirect(req, res, "The user does not have permission to reject this activity for publication.", '/', "You do not have permission to reject this activity for publication.");
    }
});

// @desc    Delete activity
// @route   DELETE /activities/:id
router.delete('/:id', ensureAuthenticated, async (req, res) => {
    try {
        await Activity.deleteOne({ _id: req.params.id });
        req.flash('success_msg', 'The activity was successfully deleted.');
        res.redirect('/activities/my-activities');
    } catch (e) {
        errorRedirect(req, res, e, '/');
    }
});

module.exports = router;