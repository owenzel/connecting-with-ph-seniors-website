const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');

// Load User model
const User = require('./../models/User');
const { forwardAuthenticated } = require('../middleware/auth');

// @desc    Register page
// @route   GET /register
router.get('/register', forwardAuthenticated, (req, res) => {
    res.render('register');
});

// @desc    Login page
// @route   GET /login
router.get('/login', forwardAuthenticated, (req, res) => {
    res.render('login');
});

// @desc    Process register form
// @route   POST /register
router.post('/register', (req, res) => {
    const { name, username, email, password, password2 } = req.body;
    let errors = [];

    // Check required fields
    if (!name || !username || !email || !password || !password2) {
        errors.push({ msg: 'Please fill in all fields.' });
    }

    // Check passwords match
    if (password !== password2) {
        errors.push({ msg: 'Passwords do not match.' });
    }

    // Check password length
    if (password.length < 6) {
        errors.push({ msg: 'Password should be at least 6 characters in length.' });
    }

    // If there are errors, re-render the page with the errors and entered information passed in
    if (errors.length > 0) {
        res.render('register', {
            errors,
            name,
            username,
            email,
            password,
            password2
        });
    } else { // Validation passed
        User.findOne({ username: username }).then(user => {
            if (user) {
                // User with the same username already exists. Re-render with an error
                errors.push({ msg: 'Username is not available. '});
                res.render('register', {
                    errors,
                    name,
                    username,
                    email,
                    password,
                    password2
                });
            } else {
                const newUser = new User({
                    name,
                    username,
                    email,
                    password,
                });

                // Hash password
                bcrypt.genSalt(10, (err, salt) =>
                    bcrypt.hash(newUser.password, salt, (err, hash) => {
                        if(err) throw err;
                        // Set password to hashed
                        newUser.password = hash;

                        // Save user
                        newUser.save()
                            .then(user => {
                                // Use flash messages and store the success message in the session. Then, redirect to the login page.
                                req.flash('success_msg', 'You are now registed and can log in.');
                                res.redirect('/users/login');
                            })
                            .catch(err => console.log(err));
                }));
            }
        });
    }
});

// @desc    Process login form
// @route   POST /login
router.post('/login', (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/users/login',
        failureFlash: true
    })(req, res, next);
});

// @desc    Process logout
// @route   POST /login
router.get('/logout', (req, res) => {
    req.logout();
    req.flash('success_msg', 'You are logged out');
    res.redirect('/users/login');
});

module.exports = router;