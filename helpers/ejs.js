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
            return `<form action="/activities/${activityId}" method="POST" id="delete-form">
                        <input type="hidden" name="_method" value="DELETE">
                        <button type="submit" class="waves-effect waves-light btn red"><i class="fas fa-trash"></i> Delete</button>
                    </form>`;
        } else {
            return '';
        }
    },
    cancelRsvpBtn: function(loggedInUser, activityRsvps, activityId, alternative='') {
        if (activityRsvps.find(activity => activity.email == loggedInUser.email)) {
            return `<form action="/activities/${activityId}/rsvp" method="POST">
                        <input type="hidden" name="_method" value="DELETE">
                        <button type="submit" class="btn red">CANCEL RSVP</button>
                    </form>`;
        } else {
            return alternative;
        }
    },
    // Display selected option in a select dropdown via Regex
    select: function (selected, options) {
        return options
          .replace(
            new RegExp(' value="' + selected + '"'),
            '$& selected="selected"'
          )
          .replace(
            new RegExp('>' + selected + '</option>'),
            ' selected="selected"$&'
          );
      },
};