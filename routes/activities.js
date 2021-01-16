const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');
const { formatDate } = require('./../helpers/helpers');

const transporter = require('./../config/email');
const User = require('./../models/User');
const Activity = require('../models/Activity');

// @desc    Show My Activities page
// @route   GET /activities/my-activities
router.get('/my-activities', ensureAuthenticated, async (req, res) => {
    try {
        const activities = await Activity.find({ })
            .populate('leaderUser')
            .populate('creatorUser')
            .sort({ date: 'asc', time: 'asc' })
            .lean();

        let activitiesCreated = [];
        let activitiesLeading = [];
        let activitiesAttending = [];
        let activitiesToReview = [];

        activities.forEach(activity => {
            // Check if the user is an admin and if the activity is under review (needing approval)
            if (req.user.admin && activity.status === 'under review') {
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
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
});

// @desc    Show create activity page
// @route   GET /activities/create
router.get('/create', ensureAuthenticated, async (req, res) => {
    try {
        const users = await User.find({}).lean();
        res.render('activities/create', { users });
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
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
            console.log(e);
            req.flash('error_msg', "We're sorry. Something went wrong.");
            res.redirect('/');
        }
    }

    // If there are errors, re-render the page with the errors and entered information passed in
    if (errors.length > 0) {
        try {
            const users = await User.find({}).lean();
            res.render('activities/create', {
                errors,
                users
            });
        } catch (e) {
            console.log(e);
            req.flash('error_msg', "We're sorry. Something went wrong.");
            res.redirect('/');
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
            status: req.user.admin ? 'published' : 'under review',
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
                            console.log(e);
                            req.flash('error_msg', "We're sorry. Something went wrong. Please check the table below to see if your activity was submitted for review. If you do not see it, please try again.");
                            res.redirect('/activities/my-activities');
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
                console.log(e);
                req.flash('error_msg', "We're sorry. Something went wrong.");
                res.redirect('/');
            });
    }
});

// @desc    Show single activity page
// @route   GET /activities/:id
router.get('/:id', async (req, res) => {
    try {
        let activity = await Activity.findById(req.params.id)
            .populate('leaderUser')
            .populate('creatorUser')
            .lean();
        
        // If the requested activity does not exist, redirect them and throw an error
        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/');
        }

        // If this is a published activity or it is not published but the user still has access, render a page displaying information about the activity
        if (activity.status == 'published' || (activity.status == 'under review' && (req.user.admin || req.user.id == activity.creatorUser._id || req.user.id == activity.leaderUser._id))) {
            res.render('activities/show', {
                activity
            });
        // If the user is attempting to view an activity under review that they don't have access to, redirect them and throw an error
        } else {
            req.flash('error_msg', "You do not have permission to view this unpublished activity.");
            res.redirect('/');
        }

        // If the requested activity does exist, render a page with the activity information
        
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "This activity could not be found.");
        res.redirect('/');
    }
});

// @desc    Show single activity's RSVPs
// @route   GET /activities/:id/rsvps
router.get('/:id/rsvps', ensureAuthenticated, async (req, res) => {
    try {
        const activity = await Activity.findById(req.params.id).lean();
        
        // If the requested activity does not exist, redirect them and throw an error
        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/my-activities');
        }

        // If a user is attempting to view the RSVPs for an activity that do not have access to, redirect them with an error message
        if (req.user.admin || activity.creatorUser == req.user.id || activity.leaderUser == req.user.id) {
            res.render('activities/rsvps', {
                activity
            });
        // If the user is an admin or has access to this activity, render a page with the list of RSVPs
        } else {
            req.flash('error_msg', "You do not have permission to edit this activity.");
            res.redirect('/');
        }
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "This activity could not be found.");
        res.redirect('/');
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
        const activity = await Activity.findOne({ _id: req.params.id }).lean();

        if (!activity) {
            console.log(e);
            req.flash('error_msg', "We're sorry. Something went wrong.");
            res.redirect('/');
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
                    console.log(e);
                    req.flash('error_msg', "We're sorry. Something went wrong.");
                    res.redirect('/');
                }
            }
            // If the new RSVP has already signed up for this activity, redirect the user with an error
            else {
                req.flash('error_msg', "A user with this email is already signed up for this activity!");
                res.redirect('/activities/my-activities');
            }
        }
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
});

// @desc    Cancel RSVP to activity
// @route   PUT /activities/:id/cancel
router.delete('/:id/:userEmail/rsvp', ensureAuthenticated, async (req, res) => {
    try {
        let activity = await Activity.findById(req.params.id).lean();

        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/');
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
                console.log(e);
                req.flash('error_msg', "We're sorry. Something went wrong.");
                res.redirect('/');
            }
        } else {
            req.flash('error_msg', "You were not RSVP'd to this activity.");
            res.redirect('/');
        }
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "This activity could not be found.");
        res.redirect('/activities/my-activities');
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
            console.log(e);
            req.flash('error_msg', "We're sorry. Something went wrong. Your questions were not submitted.");
            res.redirect('/');
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
        const activity = await Activity.findOne({_id: req.params.id})
            .populate('leaderUser')
            .lean();
    
        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/');
        }
    
        // If the user is an admin or has access to this activity, render the edit page
        if (req.user.admin || (activity.status == 'published' && activity.creatorUser == req.user.id)) {
            res.render('activities/edit', { 
                activity,
            });
        // If a user is attempting to edit an activity that do not have access to, redirect them with an error message
        } else {
            req.flash('error_msg', "You do not have permission to edit this activity.");
            res.redirect('/');
        }
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
    
});

// @desc    Update activity
// @route   PUT /activities/:id
router.put('/:id', ensureAuthenticated, async (req, res) => {
    try {
        let activity = await Activity.findById(req.params.id).lean();

        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/');
        }

        // If the user is an admin or has access to this activity, update it
        if (req.user.admin || activity.creatorUser == req.user.id) {
            activity = await Activity.findOneAndUpdate({ _id: req.params.id }, req.body, {
                new: true,
                runValidators: true
            });

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
            req.flash('error_msg', "You do not have permission to edit this activity.");
            res.redirect('/');
        }
    } catch (e) {
        console.log(e);
        res.redirect('/activities/my-activities');
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
                        <p>Congratulations! Your activity called "${activity.title}" was published on Connecting With Parma Heights Seniors - Virtual Events. Other users may now view it and sign up. Log in to <a href="${process.env.WEBSITE}/activities/${req.params.id}"> Connecting With Parma Heights Seniors - Virtual Activities website</a> to view it.</p>
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
            console.log(e);
            req.flash('error_msg', "We're sorry. Something went wrong.");
            res.redirect('/');
        }
    } else {
        req.flash('error_msg', "You do not have permission to publish this activity.");
        res.redirect('/');
    }
});

// @desc    Reject activity for publication (by admin)
// @route   POST /activities/:id/reject
router.post('/:id/reject', ensureAuthenticated, async (req, res) => {
    // Delete the activity and send an email to the creator if this is an admin. Otherwise, redirect and render an error
    if (req.user.admin) {
        try {
            // Find the activity to delete
            const activity = await Activity.findOne({ _id: req.params.id }).lean();
            
            // Ensure the activity to delete exists; otherwise redirect with an error
            if (!activity) {
                req.flash('error_msg', "The requested activity does not exist.");
                res.redirect('/activities/my-activities');
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
                                <p>Apologies! Your activity called "${activity.title}" was rejected for publication on Connecting With Parma Heights Seniors - Virtual Events. Please review the feedback below. Reply to this email if you have any questions.</p>
                                <br>
                                <h3>Submitted Activity Details:</h3>
                                <p><b>Title:</b> ${activity.title}</p>
                                <p><b>Date: </b> ${formatDate(activity.date, 'MMMM Do YYYY, h:mm a')}</p>
                                <p><b>Leader Name:</b> ${activity.leaderUser.name}</p>
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
                    console.log(e);
                    req.flash('error_msg', "We're sorry. Something went wrong.");
                    res.redirect('/activities/my-activities');
                }
            }
        } catch (e) {
            console.log(e);
            req.flash('error_msg', "We're sorry. Something went wrong.");
            res.redirect('/activities/my-activities');
        }
    } else {
        req.flash('error_msg', "You do not have permission to reject this activity for publication.");
        res.redirect('/');
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
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
});

module.exports = router;