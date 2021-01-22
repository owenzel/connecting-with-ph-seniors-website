const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth');
const transporter = require('./../config/email');
const User = require('./../models/User');

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
    // Get the submitted fields from the register form
    const { name, username, email, phone, password, password2, signature } = req.body;

    // Store any errors in validating the form submission
    let errors = [];

    // Function for rerendering the page with the submitted information and any errors from validating the submission
    const reRenderWithErrors = () => res.render('users/register', {
        errors,
        name,
        username,
        email,
        phone,
        password,
        password2,
    });

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
        reRenderWithErrors();
    }

    // If there were no erros in validating the form submission, proceed with registering the user
    else {
        // Ensure the username isn't already taken. If it is, re-render with an error. Otherwise, proceed with saving them to the database
        User.findOne({ username: username }).then(user => {
            if (user) {
                errors.push({ msg: 'Username is not available.'});
                reRenderWithErrors();
            } else {
                // Create a new user with the entered information
                const newUser = new User({
                    name,
                    username,
                    email: email ? email : `${name} (no email)`,
                    phone,
                    password,
                    signature
                });

                // Hash the password
                bcrypt.genSalt(10, (err, salt) =>
                    bcrypt.hash(newUser.password, salt, (err, hash) => {
                        if (err) throw err;
                        // Set the new user's password to the hashed one
                        newUser.password = hash;

                        // Save the new user to the database
                        newUser.save()
                            .then(user => {
                                // If an email was entered, create a registration confirmation email
                                if (email) {
                                    const emailContent = {
                                        from: `${process.env.EMAIL}`,
                                        to: `${email}`,
                                        subject: `Registered on Connecting With Parma Heights Seniors - Virtual Activities`,
                                        html: `
                                                <p>An account with this email and the username ${username} was registered on <a href="${process.env.WEBSITE}/">Connecting with Parma Heights Seniors - Virtual Activities</a>.</p>
                                                <p>Website: ${process.env.WEBSITE}/</p>
                                            `
                                    };
                                
                                    // Send the registration confirmation email to the newly registered user
                                    transporter.sendMail(emailContent, (e, data) => {
                                        if (e) {
                                            console.log(e);
                                        }
                                    });
                                }
                            })
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
    // Clear the Sign Up Cart
    req.session.signUps = [];

    passport.authenticate('local', {
        successRedirect: '/activities/my-activities',
        failureRedirect: '/users/login',
        failureFlash: true
    })(req, res, next);
});

// @desc    Process logout
// @route   POST /login
router.get('/logout', ensureAuthenticated, (req, res) => {
    // Clear the Sign Up Cart
    req.session.signUps = [];

    req.logout();
    req.flash('success_msg', 'You are logged out.');
    res.redirect('/users/login');
});

module.exports = router;