const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');

const User = require('./../models/User');
const Activity = require('./../models/Activities');

// @desc    Show My Activities page
// @route   GET /activities/my-activities
router.get('/my-activities', ensureAuthenticated, async (req, res) => {
    try {
        const activitiesCreated = await Activity.find({ creatorUser: req.user.id }).populate('leaderUser').populate('creatorUser').lean();
        const activitiesLeading = await Activity.find({ leaderUser: req.user.id }).populate('leaderUser').populate('creatorUser').lean();
        const activitiesAttending = [];

        // Find activities that the logged in user RSVP'd they're going to
        const activities = await Activity.find({ }).populate('leaderUser').populate('creatorUser').lean();
        activities.forEach(activity => {
            const found = activity.rsvps.find(rsvp => rsvp.email == req.user.email);
            if (found) {
                activitiesAttending.push(activity);
            }
        });

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
            console.log(leaderUser);

            if (!leaderUser) {
                console.log('no leader user');
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
        const newActivity = new Activity({
            title,
            date: new Date(`${date}T${time}`),
            leaderName,
            leaderUser: leaderUsername ? leaderUser._id : null,
            status,
            body,
            creatorUser: req.user.id
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
        
        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/');
        }

        res.render('activities/show', {
            activity
        });
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "This activity could not be found.");
        res.redirect('/');
    }
});


// @desc    Edit activity page
// @route   GET /activities/edit/:id
router.get('/edit/:id', ensureAuthenticated, async (req, res) => {
    try {
        const activity = await Activity.findOne({
            _id: req.params.id
        }).lean();
    
        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/');
        }
    
        // If a user is attempting to edit an activity that do not have access to, redirect them
        if (activity.creatorUser != req.user.id) {
            res.redirect('/activities');
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

        if (!activity) {
            req.flash('error_msg', "This activity could not be found.");
            res.redirect('/');
        }

        if (activity.creatorUser != req.user.id) {
            res.redirect('/activities');
        } else {
            activity = await Activity.findOneAndUpdate({ _id: req.params.id }, req.body, {
                new: true,
                runValidators: true
            });

            res.redirect('activities/my-activities');
        }
    } catch (e) {
        console.log(e);
        res.redirect('activities/my-activities');
    }
});

// @desc    Delete activity
// @route   DELETE /activities/:id
router.delete('/:id', ensureAuthenticated, async (req, res) => {
    try {
        await Activity.deleteOne({ _id: req.params.id });
        res.redirect('activities/my-activities');
    } catch (e) {
        console.log(e);
        req.flash('error_msg', "We're sorry. Something went wrong.");
        res.redirect('/');
    }
});

module.exports = router;