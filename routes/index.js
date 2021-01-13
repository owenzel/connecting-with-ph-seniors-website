const express = require('express');
const router = express.Router();

const Activity = require('./../models/Activities');

// @desc    Show landing page: all public activities
// @route   GET /
router.get('/', async (req, res) => {
    try {
        const activities = await Activity.find({ status: 'public' })
            .populate('leaderUser')
            .populate('creatorUser')
            .sort({ createdAt: 'desc' })
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
// @route   GET /
router.get('/questions', async (req, res) => {
    res.render('questions');
});

// @desc    Show activities sign up page
// @route   GET /sign-up
router.get('/sign-up', async (req, res) => {
    try {
        const activities = await Activity.find({ status: 'public' })
            .populate('leaderUser')
            .populate('creatorUser')
            .sort({ createdAt: 'desc' })
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

// @desc    Process activities sign-up
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