const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');

// Load User model
const User = require('./../models/User');
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');

// @desc    Show register page
// @route   GET /users/register
router.get('/register', forwardAuthenticated, (req, res) => {
    res.render('users/register');
});

// @desc    Show login page
// @route   GET /users/login
router.get('/login', forwardAuthenticated, (req, res) => {
    res.render('users/login');
});

// @desc    Process register form
// @route   POST /register
router.post('/register', forwardAuthenticated, (req, res) => {
    const { name, username, email, phone, password, password2, signature } = req.body;
    let errors = [];

    // Check required fields
    if (!name || !username || !phone || !password || !password2 || !signature) {
        errors.push({ msg: 'Please fill in all fields (email is optional but strongly recommended).' });
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
        res.render('users/register', {
            errors,
            name,
            username,
            email,
            phone,
            password,
            password2,
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
                    email: email ? email : `${name} (no email)`,
                    phone,
                    password,
                    password2
                });
            } else {
                const newUser = new User({
                    name,
                    username,
                    email,
                    phone,
                    password,
                    signature
                });

                // Hash password
                bcrypt.genSalt(10, (err, salt) =>
                    bcrypt.hash(newUser.password, salt, (err, hash) => {
                        if(err) throw err;
                        // Set password to hashed
                        newUser.password = hash;

                        // Save the new user
                        newUser.save()
                            .then(user => {
                                // Redirect to the login page with a success message (stored in the session)
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
router.post('/login', forwardAuthenticated, (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/activities/my-activities',
        failureRedirect: '/users/login',
        failureFlash: true
    })(req, res, next);
});

// @desc    Process logout
// @route   POST /login
router.get('/logout', ensureAuthenticated, (req, res) => {
    req.logout();
    req.flash('success_msg', 'You are logged out');
    res.redirect('/users/login');
});

module.exports = router;