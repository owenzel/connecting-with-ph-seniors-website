const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');

const User = require('./../models/User');
const Activity = require('./../models/Activities');

// @desc    Show My Activities page
// @route   GET /activities/my-activities
router.get('/my-activities', ensureAuthenticated, async (req, res) => {
    try {
        const activitiesCreated = await Activity.find({ creatorUser: req.user.id })
            .populate('leaderUser')
            .populate('creatorUser')
            .sort({ date: 'asc', time: 'asc' })
            .lean();
        const activitiesLeading = await Activity.find({ leaderUser: req.user.id })
            .populate('leaderUser')
            .populate('creatorUser')
            .sort({ date: 'asc', time: 'asc' })
            .lean();
        const activitiesAttending = [];

        // Find activities that the logged in user RSVP'd they're going to and sort them in ascending order by date
        const activities = await Activity.find({ }).populate('leaderUser').populate('creatorUser').lean();
        activities.forEach(activity => {
            const found = activity.rsvps.find(rsvp => rsvp.email == req.user.email);
            if (found) {
                activitiesAttending.push(activity);
            }
        });
        activitiesAttending.sort((a, b) => { return a.date-b.date });

        res.render('activities/my-activities', {
            user: req.user,
            activitiesCreated,
            activitiesLeading,
            activitiesAttending
        });
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
});

// @desc    Show create activity page
// @route   GET /activities/create
router.get('/create', ensureAuthenticated, (req, res) => {
    res.render('activities/create');
});

// @desc    Process create activity form
// @route   POST /activities/create
router.post('/create', ensureAuthenticated, async (req, res) => {
    const { title, date, time, leaderName, leaderUsername, status, body } = req.body;
    let errors = [];

    // Check required fields
    if (!title || !date || !time || !leaderName || !status || !body) {
        errors.push({ msg: 'Please fill in all fields (Activity Leader Username is optional but strongly recommended if they have an account).' });
    }
    
    // If a username for an activity leader was entered, find them
    let leaderUser = null;
    
    if (leaderUsername) {
        try {
            leaderUser = await User.findOne({ username: leaderUsername }).lean();

            if (!leaderUser) {
                errors.push({ msg: 'The Activity Leader Username does not exist. Please ensure this is the correct username or leave the field blank if this person does not have an account.' });
            }
        } catch (e) {
            console.log(e);
            req.flash('error_msg', "We're sorry. Something went wrong.");
            res.redirect('/');
        }
    }

    // If there are errors, re-render the page with the errors and entered information passed in
    if (errors.length > 0) {
        res.render('activities/create', {
            errors
        });
    } else { // Validation passed
        // Create and save the new activity
        //const expirationDate = new Date(`${date}T${time}`);
        const expirationDate = new Date(date);
        expirationDate.setDate(expirationDate.getDate() + 1);

        const newActivity = new Activity({
            title,
            date: new Date(`${date}T${time}`),
            leaderName,
            leaderUser: leaderUsername ? leaderUser._id : null,
            status,
            body,
            creatorUser: req.user.id,
            expireAt: expirationDate,
        });

        newActivity.save()
            .then(activity => {
                // Redirect to the my activities page with a success message (stored in the session)
                req.flash('success_msg', 'The activity was successfully created.');
                res.redirect('/activities/my-activities');
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

        // If the requested activity does exist, render a page with the activity information
        res.render('activities/show', {
            activity
        });
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
        if (!req.user.admin || activity.creatorUser != req.user.id || activity.leaderUser != req.user.id) {
            req.flash('error_msg', "You do not have permission to edit this activity.");
            res.redirect('/');
        // If the user is an admin or has access to this activity, render a page with the list of RSVPs
        } else {
            res.render('activities/rsvps', {
                title: activity.title,
                rsvps: activity.rsvps
            });
        }
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "This activity could not be found.");
        res.redirect('/');
    }
});

// @desc    Cancel RSVP to activity
// @route   PUT /activities/:id/cancel
router.delete('/:id/rsvp', ensureAuthenticated, async (req, res) => {
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
                    { $pull: { rsvps: { email: req.user.email } } }
                );

                // If the RSVP was successfully canceled, redirect them with a success message
                req.flash('success_msg', 'You have successfully canceled your RSVP.');
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


// @desc    Edit activity page
// @route   GET /activities/edit/:id
router.get('/:id/edit', ensureAuthenticated, async (req, res) => {
    try {
        const activity = await Activity.findOne({_id: req.params.id}).lean();
    
        // If the requested activity does not exist, redirect the user with an error message
        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/');
        }
    
        // If a user is attempting to edit an activity that do not have access to, redirect them with an error message
        if (!req.user.admin || activity.creatorUser != req.user.id) {
            req.flash('error_msg', "You do not have permission to edit this activity.");
            res.redirect('/');
        // If the user is an admin or has access to this activity, render the edit page
        } else {
            res.render('activities/edit', {
                activity,
            });
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

        // If a user is attempting to edit an activity that do not have access to, redirect them with an error message
        if (!req.user.admin || activity.creatorUser != req.user.id) {
            req.flash('error_msg', "You do not have permission to edit this activity.");
            res.redirect('/');
        // If the user is an admin or has access to this activity, update it
        } else {
            activity = await Activity.findOneAndUpdate({ _id: req.params.id }, req.body, {
                new: true,
                runValidators: true
            });

            req.flash('success_msg', 'The activity was successfully edited.');
            res.redirect('/activities/my-activities');
        }
    } catch (e) {
        console.log(e);
        res.redirect('/activities/my-activities');
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