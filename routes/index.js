const express = require('express');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('./../config/auth');

// @desc    Landing page
// @route   GET /
router.get('/', forwardAuthenticated, (req, res) => {
    res.render('home');
});

// @desc    Dashboard page
// @route   GET /dashboard
router.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        user: req.user
    });
});

module.exports = router;