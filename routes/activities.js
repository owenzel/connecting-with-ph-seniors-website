const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');

const Activity = require('./../models/Activities');

// @desc    Add activity page
// @route   GET /activities/add
router.get('/add', ensureAuthenticated, (req, res) => {
    res.render('activities/add');
});

// @desc    Process add form
// @route   POST /activities
router.post('/', ensureAuthenticated, async (req, res) => {
    try {
        req.body.user = req.user.id;
        await Activity.create(req.body);
        res.redirect('/dashboard');
    } catch (e) {
        console.log(e);
        res.render('error/500');
    }
});

// @desc    All activities page
// @route   GET /activities
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const activities = await Activity.find({ status: 'public' })
            .populate('user')
            .sort({ createdAt: 'desc' })
            .lean();
        
        res.render('activities/index', {
            activities
        });
    } catch (e) {
        console.log(e);
        res.render('error/500');
    }
});

// @desc    Single activity page
// @route   GET /activities/:id
router.get('/:id', ensureAuthenticated, async (req, res) => {
    try {
        let activity = await Activity.findById(req.params.id)
            .populate('user')
            .lean();
        
        if (!activity) {
            return res.render('error/404');
        }

        res.render('activities/show', {
            activity
        });
    } catch (e) {
        console.log(error);
        res.render('error/404');
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
            return res.render('error/404');
        }
    
        // If a user is attempting to edit an activity that do not have access to, redirect them
        if (activity.user != req.user.id) {
            res.redirect('/activities');
        } else {
            res.render('activities/edit', {
                activity,
            });
        }
    } catch (e) {
        console.log(e);
        return res.render('error/505');
    }
    
});

// @desc    Update activity
// @route   PUT /activities/:id
router.put('/:id', ensureAuthenticated, async (req, res) => {
    try {
        let activity = await Activity.findById(req.params.id).lean();

        if (!activity) {
            return res.render('error/404');
        }

        if (activity.user != req.user.id) {
            res.redirect('/activities');
        } else {
            activity = await Activity.findOneAndUpdate({ _id: req.params.id }, req.body, {
                new: true,
                runValidators: true
            });

            res.redirect('/dashboard');
        }
    } catch (e) {
        console.log(e);
        res.redirect('/dashboard');
    }
});

// @desc    Delete activity
// @route   DELETE /activities/:id
router.delete('/:id', ensureAuthenticated, async (req, res) => {
    try {
        await Activity.deleteOne({ _id: req.params.id });
        res.redirect('/dashboard');
    } catch (e) {
        console.log(e);
        return res.render('error/500');
    }
});

// @desc    User activities
// @route   GET /activities/user/:userId
router.get('/user/:userId', ensureAuthenticated, async (req, res) => {
    try {
        const activities = await Activity.find({
            user: req.params.userId,
            status: 'public'
        })
            .populate('user')
            .lean();
        
        res.render('activities/index', {
            activities
        })
    } catch (e) {
        console.log(e);
        res.render('error/500');
    }
});

module.exports = router;