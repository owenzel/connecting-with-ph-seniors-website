// Credit: https://github.com/bradtraversy/storybooks/blob/master/helpers/hbs.js

const moment = require('moment');

module.exports = {
    // Return a list of the start (today) and end (which is a given number of months away from the start) dates
    getDateRangeStartingToday: function (months, days, years) {
        const start = new Date();
        const end = new Date().setFullYear(start.getFullYear() + years, start.getUTCMonth() + months, start.getDate() + days);
        return [start, end];
    },
    // Format a given date string using the moment package
    formatDate: function (date, format) {
        return moment(date).format(format);
    },
    // Truncate a string given a length and add ellipses to the end
    truncate: function (str, len) {
        if (str.length > len && str.length > 0) {
            let new_str = str + ' ';
            new_str = str.substr(0, len);
            new_str = str.substr(0, new_str.lastIndexOf(' '));
            new_str = new_str.length > 0 ? new_str : str.substr(0, len);
            return new_str + '...';
        }
        return str;
    },
    // Use regex to replace any HTML tags
    stripTags: function (input) {
        return input.replace(/<(?:.|\n)*?>/gm, '');
    },
    // Edit icon to appear on the activities the given (logged in) user posted
    editIcon: function (activityCreatorUser, loggedInUser, activityId, floating = true) {
        if (loggedInUser.admin || activityCreatorUser._id.toString() == loggedInUser._id.toString()) {
            if (floating) {
                return `<a href="/activities/${activityId}/edit" class="btn-floating halfway-fab blue"><i class="fas fa-edit fa-small"></i></a>`;
            } else {
                return `<a href="/activities/${activityId}/edit" class="waves-effect waves-light btn blue"><i class="fas fa-edit"></i> Edit</a>`;
            }
        } else {
            return '';
        }
    },
    deleteBtn: function(activityCreatorUser, loggedInUser, activityId) {
        if (loggedInUser.admin || activityCreatorUser._id.toString() == loggedInUser._id.toString()) {
            return `<button data-target="confirm-delete-modal" class="waves-effect waves-light btn red modal-trigger"><i class="fas fa-trash"></i> Delete</button>
                    <div id="confirm-delete-modal" class="modal">
                        <div class="modal-content">
                        <h4>Are you sure you want to delete this activity?</h4>
                        </div>
                        <div class="modal-footer">
                            <form action="/activities/${activityId}" method="POST" id="delete-form">
                                <input type="hidden" name="_method" value="DELETE">
                                <button type="button" href="#!" class="modal-close waves-effect waves-green btn-flat">No, I do not want to delete this activity.</button>
                                <button type="submit" class="modal-close waves-effect waves-green btn-flat">Yes, I want to delete this activity.</button>
                            </form>
                        </div>
                    </div>`;
        } else {
            return '';
        }
    },
    cancelRsvpBtn: function(userEmail, activityRsvps, activityId, btnText, alternative='') {
        if (activityRsvps.find(activity => activity.email == userEmail)) {
            return `<button data-target="confirm-cancel-modal" class="btn red modal-trigger">${btnText}</button>
                    <div id="confirm-cancel-modal" class="modal">
                        <div class="modal-content">
                        <h4>Are you sure you want to cancel this RSVP?</h4>
                        </div>
                        <div class="modal-footer">
                            <form action="/activities/${activityId}/${userEmail}/rsvp" method="POST">
                                <input type="hidden" name="_method" value="DELETE">
                                <button type="button" href="#!" class="modal-close waves-effect waves-green btn-flat">No, I do not want to cancel this RSVP.</button>
                                <button type="submit" class="modal-close waves-effect waves-green btn-flat">Yes, I want to cancel this RSVP.</button>
                            </form>
                        </div>
                    </div>`;
        } else {
            return alternative;
        }
    }
};