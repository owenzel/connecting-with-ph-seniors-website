const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');

const Activity = require('./../models/Activities');

// @desc    Landing page
// @route   GET /
router.get('/', forwardAuthenticated, (req, res) => {
    res.render('home');
});

// @desc    Dashboard page
// @route   GET /dashboard
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        const activities = await Activity.find({ user: req.user.id }).lean();
        res.render('dashboard', {
            user: req.user,
            activities
        });
    } catch (e) {
        console.log(e);
        res.render('error/500');
    }
});

module.exports = router;