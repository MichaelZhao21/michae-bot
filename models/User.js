const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        id: String,
        rolls: [Number],
        dating: [Number],
    },
    { collection: 'michae-users' }
);

const User = mongoose.model('User', userSchema);
module.exports = User;
