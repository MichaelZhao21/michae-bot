require('dotenv').config();
const fetch = require('node-fetch');
const Character = require('./models/Character');
const mongoose = require('mongoose');

// Connect mongoose to server
const mongoURL = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_URL}/data?retryWrites=true&w=majority`;
mongoose.connect(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });

// Open database connection
const db = mongoose.connection;
db.on('error', (error) => {
    console.error(error);
    process.exit(1);
});
db.once('open', async () => {
    console.log('Connected to mongodb database!');

    // Count characters
    const total = await Character.count({});
    console.log(`There are ${total} characters in the database.`);

    // Counter
    let count = 0;

    // Iterate through collection
    for await (const doc of Character.find([{ $sort: { name: 1 } }])) {
        updateFavoriteCount(doc, ++count, total);
    }

    db.close();
});

/**
 * Updates the favorite count for one document
 *
 * @param {mongoose.Document} doc Mongoose document
 * @param {number} count Current count
 * @param {number} total Total count
 */
async function updateFavoriteCount(doc, count, total) {
    let html = await fetch(doc.url).then((res) => res.text());

    // Check if the page is throttled
    while (isThrottled(html)) {
        console.log(
            `${doc} - Throttled... sleeping for 10 seconds! Verify non-bot status in browser: https://myanimelist.net/`
        );
        await sleep(10000);
        html = await fetch(doc.url).then((res) => res.text());
    }

    const favorites = getFavorites(html);

    if (favorites === null) {
        console.log(`${doc.name} - ERROR: Could not find favorites`);
    } else {
        await doc.updateOne({ favorites });
        console.log(`${doc.name} has ${favorites} favorites (${count}/${total})`);
    }
}

/**
 * Finds the number of favorites for each character in the list
 *
 * @param {string} html HTML to parse
 * @returns {number} Number of favorites
 */
function getFavorites(html) {
    try {
        const num = Number.parseInt(
            html
                .replace(/.*Member Favorites: (.*?)<\/td>.*/gs, '$1')
                .replace(',', '')
                .trim()
        );
        if (isNaN(num)) return null;
        return num;
    } catch (err) {
        return null;
    }
}

/**
 * Checks to see if the current page is throttled bc too many bot requests.
 * This can be easily bypassed by manually telling the site that it is a human!
 *
 * @param {string} html HTML string
 * @returns {boolean} True if the current page is throttled
 */
function isThrottled(html) {
    return html.includes('We are temporarily restricting site connections due to heavy access.');
}

/**
 * Pauses execution for some time
 *
 * @param {number} ms Time in milliseconds
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
